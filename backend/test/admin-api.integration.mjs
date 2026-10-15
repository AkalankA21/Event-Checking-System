import 'reflect-metadata';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AppModule } from '../dist/app.module.js';
import { databaseOptions } from '../dist/database/database.config.js';
import { SAMPLE_TICKETS, seedTickets } from '../dist/database/seed-tickets.js';
import { Ticket } from '../dist/tickets/ticket.entity.js';
import { CheckInLog } from '../dist/check-in-logs/check-in-log.entity.js';

async function snapshot(database) {
  return {
    tickets: await database
      .getRepository(Ticket)
      .find({ order: { id: 'ASC' } }),
    logs: await database
      .getRepository(CheckInLog)
      .find({ order: { id: 'ASC' } }),
  };
}

test('admin endpoints over HTTP with a temporary SQLite database', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'event-admin-api-'));
  const database = new DataSource({
    ...databaseOptions,
    database: join(directory, 'admin-test.sqlite'),
    synchronize: true,
  });
  const demo = new DataSource({ ...databaseOptions, synchronize: false });
  const evidence = { responses: [] };
  const initialSummary = {
    total: 15,
    checkedIn: 0,
    notCheckedIn: 15,
    byType: [
      { type: 'VIP', total: 5, checkedIn: 0, notCheckedIn: 5 },
      { type: 'Standard', total: 5, checkedIn: 0, notCheckedIn: 5 },
      { type: 'Student', total: 5, checkedIn: 0, notCheckedIn: 5 },
    ],
  };
  const initialList = SAMPLE_TICKETS.map((ticket) => ({
    ...ticket,
    checkedIn: false,
    checkedInAt: null,
  })).sort((a, b) =>
    a.reference < b.reference ? -1 : a.reference > b.reference ? 1 : 0,
  );
  let app;

  try {
    await demo.initialize();
    const demoBefore = await snapshot(demo);
    await database.initialize();
    await seedTickets(database);
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(getDataSourceToken())
      .useValue(database)
      .compile();
    app = module.createNestApplication({ logger: false });
    await app.listen(0, '127.0.0.1');
    const baseUrl = await app.getUrl();
    evidence.baseUrl = baseUrl;
    evidence.database = 'Temporary SQLite file, removed after testing.';

    async function request(method, path, body) {
      const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers:
          body === undefined ? {} : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const result = { status: response.status, body: await response.json() };
      evidence.responses.push({
        method,
        path,
        ...(body ? { request: body } : {}),
        ...result,
      });
      return result;
    }

    await t.test(
      'initial list is sorted, contains all 15 public ticket records, and is read-only',
      async () => {
        const before = await snapshot(database);
        assert.deepEqual(await request('GET', '/api/admin/tickets'), {
          status: 200,
          body: initialList,
        });
        assert.deepEqual(await request('GET', '/api/admin/tickets'), {
          status: 200,
          body: initialList,
        });
        assert.deepEqual(await snapshot(database), before);
      },
    );

    await t.test(
      'initial summary returns exact totals and all three types without writing data',
      async () => {
        const before = await snapshot(database);
        assert.deepEqual(await request('GET', '/api/admin/summary'), {
          status: 200,
          body: initialSummary,
        });
        assert.deepEqual(await snapshot(database), before);
      },
    );

    await t.test(
      'a VIP check-in through the existing API is reflected in both admin endpoints',
      async () => {
        const checkIn = await request('POST', '/api/check-ins', {
          reference: 'EVT-VIP-001',
          method: 'MANUAL',
        });
        assert.equal(checkIn.status, 201);
        assert.equal(checkIn.body.checkedIn, true);
        const beforeReads = await snapshot(database);
        const list = await request('GET', '/api/admin/tickets');
        assert.equal(list.status, 200);
        assert.deepEqual(
          list.body,
          initialList.map((ticket) =>
            ticket.reference === 'EVT-VIP-001'
              ? {
                  ...ticket,
                  checkedIn: true,
                  checkedInAt: checkIn.body.checkedInAt,
                }
              : ticket,
          ),
        );
        assert.deepEqual(await request('GET', '/api/admin/summary'), {
          status: 200,
          body: {
            total: 15,
            checkedIn: 1,
            notCheckedIn: 14,
            byType: [
              { type: 'VIP', total: 5, checkedIn: 1, notCheckedIn: 4 },
              { type: 'Standard', total: 5, checkedIn: 0, notCheckedIn: 5 },
              { type: 'Student', total: 5, checkedIn: 0, notCheckedIn: 5 },
            ],
          },
        });
        const vip = beforeReads.tickets.find(
          (ticket) => ticket.reference === 'EVT-VIP-001',
        );
        assert.equal(beforeReads.logs.length, 1);
        assert.equal(beforeReads.logs[0].ticketId, vip.id);
        assert.equal(
          beforeReads.logs[0].checkedInAt.toISOString(),
          checkIn.body.checkedInAt,
        );
        assert.deepEqual(await snapshot(database), beforeReads);
      },
    );

    await t.test(
      'a type with no tickets remains in the summary with zero counts',
      async () => {
        // Delete only temporary fixture data; the demo database is never updated.
        await database.getRepository(Ticket).delete({ type: 'Student' });
        const before = await snapshot(database);
        assert.deepEqual(await request('GET', '/api/admin/summary'), {
          status: 200,
          body: {
            total: 10,
            checkedIn: 1,
            notCheckedIn: 9,
            byType: [
              { type: 'VIP', total: 5, checkedIn: 1, notCheckedIn: 4 },
              { type: 'Standard', total: 5, checkedIn: 0, notCheckedIn: 5 },
              { type: 'Student', total: 0, checkedIn: 0, notCheckedIn: 0 },
            ],
          },
        });
        assert.deepEqual(await snapshot(database), before);
      },
    );

    await t.test(
      'an empty database returns an empty list and zero counts for every type',
      async () => {
        await database.getRepository(CheckInLog).clear();
        await database.getRepository(Ticket).clear();
        const before = await snapshot(database);
        assert.deepEqual(await request('GET', '/api/admin/tickets'), {
          status: 200,
          body: [],
        });
        assert.deepEqual(await request('GET', '/api/admin/summary'), {
          status: 200,
          body: {
            total: 0,
            checkedIn: 0,
            notCheckedIn: 0,
            byType: ['VIP', 'Standard', 'Student'].map((type) => ({
              type,
              total: 0,
              checkedIn: 0,
              notCheckedIn: 0,
            })),
          },
        });
        assert.deepEqual(await snapshot(database), before);
      },
    );

    await t.test('all demo tickets and logs are unchanged', async () => {
      assert.deepEqual(await snapshot(demo), demoBefore);
      assert.equal(demoBefore.tickets.length, 15);
      evidence.demo = {
        unchanged: true,
        tickets: demoBefore.tickets.length,
        checkedIn: demoBefore.tickets.filter((ticket) => ticket.checkedIn)
          .length,
        logs: demoBefore.logs.length,
      };
    });

    const resultsDirectory = fileURLToPath(
      new URL('../test-results/', import.meta.url),
    );
    await mkdir(resultsDirectory, { recursive: true });
    await writeFile(
      join(resultsDirectory, 'admin-verification.json'),
      JSON.stringify(evidence, null, 2),
    );
    console.log(
      `HTTP responses saved to ${join(resultsDirectory, 'admin-verification.json')}`,
    );
  } finally {
    if (app) await app.close();
    if (database.isInitialized) await database.destroy();
    if (demo.isInitialized) await demo.destroy();
    await rm(directory, { recursive: true, force: true });
  }
});

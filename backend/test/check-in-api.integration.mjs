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
import { seedTickets } from '../dist/database/seed-tickets.js';
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

test('ticket API over HTTP with an isolated temporary SQLite database', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'event-checkin-api-'));
  const database = new DataSource({
    ...databaseOptions,
    database: join(directory, 'api-test.sqlite'),
    synchronize: true,
  });
  // Read-only verification of the demo data; never seed/update the demo file.
  const demo = new DataSource({ ...databaseOptions, synchronize: false });
  const evidence = { responses: [] };
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
    evidence.database = 'Temporary SQLite file, removed after this test.';

    async function request(method, path, body) {
      const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers:
          body === undefined ? {} : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const text = await response.text();
      const result = {
        status: response.status,
        body: text.startsWith('{') ? JSON.parse(text) : text,
      };
      evidence.responses.push({
        method,
        path,
        ...(body === undefined ? {} : { request: body }),
        ...result,
      });
      return result;
    }

    async function assertCheckIn(reference, method, response) {
      assert.equal(response.status, 201);
      const ticket = await database
        .getRepository(Ticket)
        .findOneByOrFail({ reference });
      const logs = await database
        .getRepository(CheckInLog)
        .findBy({ ticketId: ticket.id });
      assert.equal(logs.length, 1);
      assert.equal(ticket.checkedIn, true);
      assert.equal(logs[0].method, method);
      assert.equal(
        ticket.checkedInAt.toISOString(),
        logs[0].checkedInAt.toISOString(),
      );
      assert.deepEqual(response.body, {
        reference,
        type: ticket.type,
        checkedIn: true,
        checkedInAt: ticket.checkedInAt.toISOString(),
        method,
      });
    }

    await t.test(
      'GET validates a seeded reference without any database changes',
      async () => {
        const before = await snapshot(database);
        const response = await request('GET', '/api/tickets/EVT-VIP-001');
        assert.deepEqual(response, {
          status: 200,
          body: {
            reference: 'EVT-VIP-001',
            type: 'VIP',
            checkedIn: false,
            checkedInAt: null,
          },
        });
        assert.deepEqual(await snapshot(database), before);
      },
    );

    await t.test(
      'MANUAL check-in returns 201, persists matching data, and rejects duplicates with 409',
      async () => {
        const response = await request('POST', '/api/check-ins', {
          reference: 'EVT-VIP-001',
          method: 'MANUAL',
        });
        await assertCheckIn('EVT-VIP-001', 'MANUAL', response);
        const beforeDuplicate = await snapshot(database);
        const duplicate = await request('POST', '/api/check-ins', {
          reference: 'EVT-VIP-001',
          method: 'MANUAL',
        });
        assert.deepEqual(duplicate, {
          status: 409,
          body: {
            message: 'Ticket has already been checked in.',
            error: 'Conflict',
            statusCode: 409,
          },
        });
        assert.deepEqual(await snapshot(database), beforeDuplicate);
        const lookup = await request('GET', '/api/tickets/EVT-VIP-001');
        const { method, ...expected } = response.body;
        assert.deepEqual(lookup, { status: 200, body: expected });
      },
    );

    await t.test(
      'unknown references return 404 for both endpoints',
      async () => {
        const before = await snapshot(database);
        for (const response of [
          await request('GET', '/api/tickets/UNKNOWN'),
          await request('POST', '/api/check-ins', {
            reference: 'UNKNOWN',
            method: 'QR',
          }),
        ]) {
          assert.deepEqual(response, {
            status: 404,
            body: {
              message: 'Ticket not found.',
              error: 'Not Found',
              statusCode: 404,
            },
          });
        }
        assert.deepEqual(await snapshot(database), before);
      },
    );

    await t.test(
      'missing, blank, wrongly typed fields and invalid methods return 400',
      async () => {
        const before = await snapshot(database);
        for (const body of [
          undefined,
          null,
          [],
          {},
          { method: 'QR' },
          { reference: '', method: 'QR' },
          { reference: '  \t', method: 'QR' },
          { reference: 123, method: 'QR' },
          { reference: 'EVT-VIP-002' },
          { reference: 'EVT-VIP-002', method: 'INVALID' },
          { reference: 'EVT-VIP-002', method: 'qr' },
          { reference: 'EVT-VIP-002', method: null },
        ]) {
          const response = await request('POST', '/api/check-ins', body);
          assert.equal(response.status, 400);
          assert.equal(response.body.statusCode, 400);
          assert.equal(response.body.error, 'Bad Request');
          assert.ok(response.body.message);
        }
        assert.deepEqual(await snapshot(database), before);
      },
    );

    await t.test(
      'QR uses the same endpoint and records the supplied method',
      async () => {
        const response = await request('POST', '/api/check-ins', {
          reference: 'EVT-STANDARD-001',
          method: 'QR',
        });
        await assertCheckIn('EVT-STANDARD-001', 'QR', response);
      },
    );

    await t.test(
      'simultaneous requests for one ticket return exactly one 201 and one 409',
      async () => {
        const responses = await Promise.all([
          request('POST', '/api/check-ins', {
            reference: 'EVT-STUDENT-001',
            method: 'QR',
          }),
          request('POST', '/api/check-ins', {
            reference: 'EVT-STUDENT-001',
            method: 'MANUAL',
          }),
        ]);
        assert.deepEqual(
          responses.map(({ status }) => status).sort(),
          [201, 409],
        );
        const winner = responses.find(({ status }) => status === 201);
        await assertCheckIn('EVT-STUDENT-001', winner.body.method, winner);
        assert.equal(
          responses.find(({ status }) => status === 409).body.message,
          'Ticket has already been checked in.',
        );
      },
    );

    await t.test(
      'concurrent requests for different tickets each commit their own log',
      async () => {
        const [manual, qr] = await Promise.all([
          request('POST', '/api/check-ins', {
            reference: 'EVT-VIP-002',
            method: 'MANUAL',
          }),
          request('POST', '/api/check-ins', {
            reference: 'EVT-STANDARD-002',
            method: 'QR',
          }),
        ]);
        await assertCheckIn('EVT-VIP-002', 'MANUAL', manual);
        await assertCheckIn('EVT-STANDARD-002', 'QR', qr);
      },
    );

    await t.test(
      'a failing log insert rolls back the ticket update and hides SQLite errors',
      async () => {
        const before = await snapshot(database);
        // Inject a database failure after the update to prove actual rollback.
        await database.query(`CREATE TEMP TRIGGER reject_test_log BEFORE INSERT ON check_in_logs
        BEGIN SELECT RAISE(ABORT, 'SQLITE test-only forced log failure'); END`);
        try {
          const [response, lookup] = await Promise.all([
            request('POST', '/api/check-ins', {
              reference: 'EVT-STUDENT-005',
              method: 'QR',
            }),
            request('GET', '/api/tickets/EVT-STUDENT-005'),
          ]);
          assert.deepEqual(response, {
            status: 500,
            body: {
              message: 'Unable to complete check-in. Please try again.',
              error: 'Internal Server Error',
              statusCode: 500,
            },
          });
          assert.deepEqual(lookup, {
            status: 200,
            body: {
              reference: 'EVT-STUDENT-005',
              type: 'Student',
              checkedIn: false,
              checkedInAt: null,
            },
          });
          assert.deepEqual(await snapshot(database), before);
        } finally {
          await database.query('DROP TRIGGER reject_test_log');
        }
      },
    );

    await t.test(
      'the starter endpoint and all 15 demo tickets remain intact',
      async () => {
        assert.deepEqual(await request('GET', '/'), {
          status: 200,
          body: 'Hello World!',
        });
        assert.deepEqual(await snapshot(demo), demoBefore);
        assert.equal(demoBefore.tickets.length, 15);
        evidence.demo = {
          unchanged: true,
          tickets: demoBefore.tickets.length,
          checkedIn: demoBefore.tickets.filter((ticket) => ticket.checkedIn)
            .length,
          logs: demoBefore.logs.length,
        };
      },
    );

    const state = await snapshot(database);
    evidence.testDatabase = {
      tickets: state.tickets.length,
      checkedIn: state.tickets.filter((ticket) => ticket.checkedIn).length,
      logs: state.logs.length,
      checkedInTickets: state.tickets.filter((ticket) => ticket.checkedIn),
      checkInLogs: state.logs,
    };
    const resultsDirectory = fileURLToPath(
      new URL('../test-results/', import.meta.url),
    );
    await mkdir(resultsDirectory, { recursive: true });
    await writeFile(
      join(resultsDirectory, 'api-verification.json'),
      JSON.stringify(evidence, null, 2),
    );
    console.log(
      `HTTP responses and SQLite results saved to ${join(resultsDirectory, 'api-verification.json')}`,
    );
  } finally {
    if (app) await app.close();
    if (database.isInitialized) await database.destroy();
    if (demo.isInitialized) await demo.destroy();
    await rm(directory, { recursive: true, force: true });
  }
});

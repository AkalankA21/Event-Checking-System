import 'reflect-metadata';
import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { DataSource } from 'typeorm';
import { databaseOptions } from '../dist/database/database.config.js';
import { seedTickets } from '../dist/database/seed-tickets.js';
import { Ticket } from '../dist/tickets/ticket.entity.js';
import { CheckInLog } from '../dist/check-in-logs/check-in-log.entity.js';

let database;

beforeEach(async () => {
  // Real SQLite constraints, isolated from the local assignment database.
  database = new DataSource({ ...databaseOptions, database: ':memory:', synchronize: true });
  await database.initialize();
});

afterEach(async () => {
  if (database?.isInitialized) await database.destroy();
});

test('seeding twice preserves checked-in tickets and their successful logs', async () => {
  await seedTickets(database);
  const tickets = database.getRepository(Ticket);
  const logs = database.getRepository(CheckInLog);
  const ticket = await tickets.findOneByOrFail({ reference: 'EVT-VIP-001' });
  const checkedInAt = new Date('2026-10-14T10:00:00.000Z');
  // Fixture setup only; no application check-in service is implemented.
  await tickets.update(ticket.id, { checkedIn: true, checkedInAt });
  await logs.insert({ ticketId: ticket.id, checkedInAt, method: 'QR' });
  const beforeTickets = await tickets.find({ order: { id: 'ASC' } });
  const beforeLogs = await logs.find({ order: { id: 'ASC' } });
  await seedTickets(database);
  assert.equal(await tickets.count(), 15);
  assert.deepEqual(await tickets.find({ order: { id: 'ASC' } }), beforeTickets);
  assert.deepEqual(await logs.find({ order: { id: 'ASC' } }), beforeLogs);
});

test('SQLite rejects empty or duplicate references and invalid ticket types', async () => {
  const tickets = database.getRepository(Ticket);
  await tickets.insert({ reference: 'UNIQUE-001', type: 'Standard' });
  for (const reference of ['', '   ', '\t\r\n', 'UNIQUE-001']) {
    await assert.rejects(tickets.insert({ reference, type: 'VIP' }));
  }
  await assert.rejects(tickets.insert({ reference: 'INVALID-TYPE', type: 'Other' }));
  const ticket = await tickets.findOneByOrFail({ reference: 'UNIQUE-001' });
  assert.equal(ticket.checkedIn, false);
  assert.equal(ticket.checkedInAt, null);
});

test('SQLite enforces one log per ticket, valid methods, and the ticket foreign key', async () => {
  const tickets = database.getRepository(Ticket);
  const logs = database.getRepository(CheckInLog);
  const ticket = await tickets.save({ reference: 'LOG-001', type: 'Student' });
  const checkedInAt = new Date();
  await assert.rejects(logs.insert({ ticketId: ticket.id, checkedInAt, method: 'OTHER' }));
  await assert.rejects(logs.insert({ ticketId: ticket.id + 1000, checkedInAt, method: 'QR' }));
  await logs.insert({ ticketId: ticket.id, checkedInAt, method: 'MANUAL' });
  await assert.rejects(logs.insert({ ticketId: ticket.id, checkedInAt, method: 'QR' }));
  await assert.rejects(tickets.delete(ticket.id));
  assert.equal(await logs.count(), 1);
});

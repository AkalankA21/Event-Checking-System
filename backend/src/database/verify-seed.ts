import 'reflect-metadata';
import assert from 'node:assert/strict';
import { DataSource } from 'typeorm';
import { databaseOptions, databasePath } from './database.config.js';

// This check reads the real database without synchronizing or changing its schema.
const dataSource = new DataSource({ ...databaseOptions, synchronize: false });

try {
  await dataSource.initialize();
  const [totals] = await dataSource.query(
    `SELECT COUNT(*) AS total, COUNT(DISTINCT "reference") AS uniqueReferences,
       SUM("checkedIn") AS checkedIn,
       SUM(CASE WHEN "checkedInAt" IS NOT NULL THEN 1 ELSE 0 END) AS timestamps
     FROM "tickets"`,
  );
  const types = await dataSource.query(
    `SELECT "type", COUNT(*) AS count FROM "tickets" GROUP BY "type" ORDER BY "type"`,
  );
  const [logs] = await dataSource.query(`SELECT COUNT(*) AS count FROM "check_in_logs"`);
  assert.deepEqual(totals, { total: 15, uniqueReferences: 15, checkedIn: 0, timestamps: 0 });
  assert.deepEqual(types, [
    { type: 'Standard', count: 5 },
    { type: 'Student', count: 5 },
    { type: 'VIP', count: 5 },
  ]);
  assert.equal(logs.count, 0);
  console.log(JSON.stringify({ databasePath, totals, types, checkInLogs: logs.count }, null, 2));
  console.log('Initial seed verification passed. This check expects tickets that have not been checked in.');
} catch (error) {
  console.error('Initial seed verification failed:', error);
  process.exitCode = 1;
} finally {
  if (dataSource.isInitialized) await dataSource.destroy();
}

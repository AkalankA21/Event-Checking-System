import { fileURLToPath } from 'node:url';
import type { DataSourceOptions } from 'typeorm';
import { CheckInLog } from '../check-in-logs/check-in-log.entity.js';
import { Ticket } from '../tickets/ticket.entity.js';

// Resolves to backend/ from both src/database and dist/database.
export const databasePath = fileURLToPath(
  new URL('../../event-checkin.sqlite', import.meta.url),
);

export const databaseOptions = {
  type: 'sqlite',
  database: databasePath,
  busyTimeout: 5000,
  entities: [Ticket, CheckInLog],
  // Local development convenience only. Other environments need migrations.
  synchronize:
    process.env.NODE_ENV === undefined ||
    process.env.NODE_ENV === 'development',
} satisfies DataSourceOptions;

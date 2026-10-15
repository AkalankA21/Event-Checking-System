import type { DataSource } from 'typeorm';
import { TICKET_TYPES } from '../tickets/ticket.entity.js';

export const SAMPLE_TICKETS = TICKET_TYPES.flatMap((type) =>
  Array.from({ length: 5 }, (_, index) => ({
    reference: `EVT-${type.toUpperCase()}-${String(index + 1).padStart(3, '0')}`,
    type,
  })),
);

export async function seedTickets(dataSource: DataSource): Promise<void> {
  await dataSource.transaction(async (manager) => {
    for (const ticket of SAMPLE_TICKETS) {
      // Conflict handling targets only the reference; existing rows are never updated.
      await manager.query(
        `INSERT INTO "tickets" ("reference", "type") VALUES (?, ?)
         ON CONFLICT ("reference") DO NOTHING`,
        [ticket.reference, ticket.type],
      );
    }
  });
}

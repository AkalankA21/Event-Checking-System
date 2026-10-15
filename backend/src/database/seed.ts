import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { databaseOptions, databasePath } from './database.config.js';
import { seedTickets } from './seed-tickets.js';

const dataSource = new DataSource(databaseOptions);

try {
  await dataSource.initialize();
  await seedTickets(dataSource);
  console.log(`Seed complete: 15 stable sample references ensured in ${databasePath}. Existing tickets and logs were preserved.`);
} catch (error) {
  console.error('Ticket seed failed:', error);
  process.exitCode = 1;
} finally {
  if (dataSource.isInitialized) await dataSource.destroy();
}

import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { TypeOrmModule } from '@nestjs/typeorm';
import { databaseOptions } from './database/database.config.js';
import { TicketsModule } from './tickets/tickets.module.js';

@Module({
  imports: [TypeOrmModule.forRoot(databaseOptions), TicketsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

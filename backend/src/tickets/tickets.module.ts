import { Module } from '@nestjs/common';
import { CheckInRequestPipe } from '../check-in-logs/check-in-request.pipe.js';
import { CheckInsController } from '../check-in-logs/check-ins.controller.js';
import { TicketsController } from './tickets.controller.js';
import { TicketsService } from './tickets.service.js';
import { AdminController } from './admin.controller.js';

@Module({
  controllers: [TicketsController, CheckInsController, AdminController],
  providers: [TicketsService, CheckInRequestPipe],
})
export class TicketsModule {}

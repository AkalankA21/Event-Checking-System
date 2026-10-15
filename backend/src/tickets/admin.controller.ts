import { Controller, Get } from '@nestjs/common';
import { TicketsService } from './tickets.service.js';

// Unauthenticated read-only endpoints for this local assignment MVP.
@Controller('api/admin')
export class AdminController {
  constructor(private readonly tickets: TicketsService) {}

  @Get('tickets')
  listTickets() {
    return this.tickets.listAll();
  }

  @Get('summary')
  summary() {
    return this.tickets.summary();
  }
}

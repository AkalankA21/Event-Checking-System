import { Controller, Get, Param } from '@nestjs/common';
import { TicketsService } from './tickets.service.js';

@Controller('api/tickets')
export class TicketsController {
  constructor(private readonly tickets: TicketsService) {}

  @Get(':reference')
  findByReference(@Param('reference') reference: string) {
    return this.tickets.findByReference(reference);
  }
}

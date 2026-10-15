import { Body, Controller, Post } from '@nestjs/common';
import { TicketsService } from '../tickets/tickets.service.js';
import { CheckInRequestPipe } from './check-in-request.pipe.js';
import type { CheckInRequest } from './check-in-request.pipe.js';

@Controller('api/check-ins')
export class CheckInsController {
  constructor(private readonly tickets: TicketsService) {}

  @Post()
  checkIn(@Body(CheckInRequestPipe) request: CheckInRequest) {
    return this.tickets.checkIn(request);
  }
}

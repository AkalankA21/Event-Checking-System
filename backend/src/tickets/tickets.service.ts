import {
  ConflictException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, QueryFailedError } from 'typeorm';
import { CheckInLog } from '../check-in-logs/check-in-log.entity.js';
import type { CheckInRequest } from '../check-in-logs/check-in-request.pipe.js';
import { Ticket, TICKET_TYPES } from './ticket.entity.js';

function ticketResponse(ticket: Ticket) {
  return {
    reference: ticket.reference,
    type: ticket.type,
    checkedIn: ticket.checkedIn,
    checkedInAt: ticket.checkedInAt,
  };
}

function ticketCounts(tickets: Pick<Ticket, 'checkedIn'>[]) {
  const total = tickets.length;
  const checkedIn = tickets.filter((ticket) => ticket.checkedIn).length;
  return { total, checkedIn, notCheckedIn: total - checkedIn };
}

@Injectable()
export class TicketsService {
  private readonly logger = new Logger(TicketsService.name);
  private pending: Promise<void> = Promise.resolve();

  constructor(@InjectDataSource() private readonly database: DataSource) {}

  // SQLite has one shared TypeORM connection. Serialize reads too, so a GET
  // cannot see an uncommitted update that might subsequently be rolled back.
  private runDatabaseOperation<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.pending.then(operation);
    this.pending = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  findByReference(reference: string) {
    return this.runDatabaseOperation(async () => {
      const ticket = await this.database
        .getRepository(Ticket)
        .findOneBy({ reference });
      if (!ticket) throw new NotFoundException('Ticket not found.');
      return ticketResponse(ticket);
    });
  }

  listAll() {
    return this.runDatabaseOperation(async () => {
      const tickets = await this.database.getRepository(Ticket).find({
        select: {
          reference: true,
          type: true,
          checkedIn: true,
          checkedInAt: true,
        },
        order: { reference: 'ASC' },
      });
      return tickets.map(ticketResponse);
    });
  }

  summary() {
    return this.runDatabaseOperation(async () => {
      // One current database snapshot keeps all counts consistent. This small
      // local MVP only needs the type and status columns to calculate totals.
      const tickets = await this.database.getRepository(Ticket).find({
        select: { type: true, checkedIn: true },
      });
      return {
        ...ticketCounts(tickets),
        byType: TICKET_TYPES.map((type) => ({
          type,
          ...ticketCounts(tickets.filter((ticket) => ticket.type === type)),
        })),
      };
    });
  }

  checkIn({ reference, method }: CheckInRequest) {
    return this.runDatabaseOperation(async () => {
      try {
        return await this.database.transaction(async (manager) => {
          const tickets = manager.getRepository(Ticket);
          const checkedInAt = new Date();
          // Write first, with a condition: exactly one request can claim a ticket.
          const update = await tickets.update(
            { reference, checkedIn: false },
            { checkedIn: true, checkedInAt },
          );
          const ticket = await tickets.findOneBy({ reference });
          if (!ticket) throw new NotFoundException('Ticket not found.');
          if (update.affected !== 1) {
            throw new ConflictException('Ticket has already been checked in.');
          }
          await manager.getRepository(CheckInLog).insert({
            ticketId: ticket.id,
            checkedInAt,
            method,
          });
          return { ...ticketResponse(ticket), method };
        });
      } catch (error) {
        // The transaction has rolled back before any error reaches the caller.
        if (error instanceof HttpException) throw error;
        if (error instanceof QueryFailedError) {
          const driverError = error.driverError as {
            code?: string;
            message?: string;
          };
          if (
            driverError.code?.startsWith('SQLITE_CONSTRAINT') &&
            driverError.message?.includes(
              'UNIQUE constraint failed: check_in_logs.ticketId',
            )
          ) {
            throw new ConflictException('Ticket has already been checked in.');
          }
          if (
            driverError.code === 'SQLITE_BUSY' ||
            driverError.code === 'SQLITE_LOCKED'
          ) {
            throw new ServiceUnavailableException(
              'Check-in storage is busy. Please try again.',
            );
          }
        }
        this.logger.error(
          'Check-in transaction failed.',
          error instanceof Error ? error.stack : undefined,
        );
        throw new InternalServerErrorException(
          'Unable to complete check-in. Please try again.',
        );
      }
    });
  }
}

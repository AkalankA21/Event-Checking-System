import { Check, Column, Entity, JoinColumn, OneToOne, PrimaryGeneratedColumn } from 'typeorm';
import type { Relation } from 'typeorm';
import { Ticket } from '../tickets/ticket.entity.js';

export type CheckInMethod = 'QR' | 'MANUAL';

@Entity('check_in_logs')
@Check('CHK_check_in_method', `"method" IN ('QR', 'MANUAL')`)
export class CheckInLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'integer' })
  ticketId: number;

  // OneToOne creates a UNIQUE ticketId; RESTRICT prevents orphaned logs.
  @OneToOne(() => Ticket, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'ticketId' })
  ticket: Relation<Ticket>;

  @Column({ type: 'datetime' })
  checkedInAt: Date;

  @Column({ type: 'text' })
  method: CheckInMethod;
}

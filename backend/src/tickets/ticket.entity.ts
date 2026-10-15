import { Check, Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

export const TICKET_TYPES = ['VIP', 'Standard', 'Student'] as const;
export type TicketType = (typeof TICKET_TYPES)[number];

@Entity('tickets')
@Check('CHK_ticket_reference_nonempty', `length(trim("reference", char(9) || char(10) || char(13) || ' ')) > 0`)
@Check('CHK_ticket_type', `"type" IN ('VIP', 'Standard', 'Student')`)
@Check('CHK_ticket_checked_in', `"checkedIn" IN (0, 1)`)
export class Ticket {
  @PrimaryGeneratedColumn()
  id: number;

  // The future QR code payload is this exact reference, not an image or URL.
  @Column({ type: 'text', unique: true })
  reference: string;

  @Column({ type: 'text' })
  type: TicketType;

  @Column({ type: 'boolean', default: false })
  checkedIn: boolean;

  @Column({ type: 'datetime', nullable: true })
  checkedInAt: Date | null;
}

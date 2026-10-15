import { BadRequestException, Injectable } from '@nestjs/common';
import type { PipeTransform } from '@nestjs/common';
import type { CheckInMethod } from './check-in-log.entity.js';

export interface CheckInRequest {
  reference: string;
  method: CheckInMethod;
}

@Injectable()
export class CheckInRequestPipe implements PipeTransform<
  unknown,
  CheckInRequest
> {
  transform(value: unknown): CheckInRequest {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new BadRequestException('Request body must be a JSON object.');
    }
    const { reference, method } = value as Record<string, unknown>;
    if (typeof reference !== 'string' || reference.trim().length === 0) {
      throw new BadRequestException('reference must be a nonempty string.');
    }
    if (method !== 'QR' && method !== 'MANUAL') {
      throw new BadRequestException('method must be QR or MANUAL.');
    }
    // Preserve the exact reference used by both manual entry and future QR codes.
    return { reference, method };
  }
}

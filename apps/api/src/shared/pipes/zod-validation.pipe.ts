import { BadRequestException, type PipeTransform } from '@nestjs/common';
import type { ZodSchema } from 'zod';

/**
 * Reusable pipe that runs an inbound value through a shared Zod schema
 * (`@harbourstay/shared`). Keeps the contract as the single source of truth for
 * request shapes — controllers never redefine validation. On failure it maps
 * Zod issues to a 400 with a flat, field-oriented payload.
 */
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodSchema<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        message: 'Validation failed',
        errors: result.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      });
    }
    return result.data;
  }
}

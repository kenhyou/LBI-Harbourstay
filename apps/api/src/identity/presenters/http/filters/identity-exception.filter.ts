import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import { DomainException } from '@/shared/exceptions/domain.exception';
import { EmailAlreadyInUseException } from '@/identity/domain/exceptions/email-already-in-use.exception';
import { InvalidCredentialsException } from '@/identity/domain/exceptions/invalid-credentials.exception';
import { UserNotFoundException } from '@/identity/domain/exceptions/user-not-found.exception';

/**
 * Maps BC-7 domain exceptions to HTTP status codes at the presenter boundary
 * (the domain stays framework-free). Anything not mapped here falls through as
 * a 400 — a domain failure is always a client-visible rule break, never a 500.
 */
@Catch(DomainException)
export class IdentityExceptionFilter implements ExceptionFilter {
  catch(exception: DomainException, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const status = this.statusFor(exception);
    response.status(status).json({
      statusCode: status,
      code: exception.code,
      message: exception.message,
    });
  }

  private statusFor(exception: DomainException): number {
    if (exception instanceof EmailAlreadyInUseException) {
      return HttpStatus.CONFLICT; // 409
    }
    if (exception instanceof InvalidCredentialsException) {
      return HttpStatus.UNAUTHORIZED; // 401
    }
    if (exception instanceof UserNotFoundException) {
      return HttpStatus.NOT_FOUND; // 404
    }
    return HttpStatus.BAD_REQUEST; // 400
  }
}

import { Injectable } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import type {
  AuthUser,
  LoginRequest,
  RegisterRequest,
} from '@harbourstay/shared';
import { RegisterUserCommand } from '@/identity/application/commands/register-user.command';
import { LoginUserCommand } from '@/identity/application/commands/login-user.command';
import { RefreshTokenCommand } from '@/identity/application/commands/refresh-token.command';
import { GetCurrentUserQuery } from '@/identity/application/queries/get-current-user.query';
import type { AuthResult } from '@/identity/application/results/auth-result';

/**
 * Thin Command/Query bus facade for BC-7. The controller talks only to this —
 * it holds no logic beyond dispatching. Command results carry tokens the
 * presenter turns into cookies; the query returns a SAFE read model.
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  register(dto: RegisterRequest): Promise<AuthResult> {
    return this.commandBus.execute(
      new RegisterUserCommand(dto.email, dto.password, dto.role),
    );
  }

  login(dto: LoginRequest): Promise<AuthResult> {
    return this.commandBus.execute(
      new LoginUserCommand(dto.email, dto.password),
    );
  }

  refresh(refreshToken: string): Promise<AuthResult> {
    return this.commandBus.execute(new RefreshTokenCommand(refreshToken));
  }

  getCurrentUser(userId: string): Promise<AuthUser> {
    return this.queryBus.execute(new GetCurrentUserQuery(userId));
  }
}

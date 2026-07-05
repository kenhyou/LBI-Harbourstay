import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from '@/infra/prisma/prisma.module';
import { AuthController } from '@/identity/presenters/http/auth.controller';
import { AuthService } from '@/identity/application/services/auth.service';
import { JwtCookieGuard } from '@/identity/presenters/http/guards/jwt-cookie.guard';
import { RolesGuard } from '@/identity/presenters/http/guards/roles.guard';
import { UserRepositoryPort } from '@/identity/application/ports/user.repository.port';
import { UserQueryPort } from '@/identity/application/ports/user.query.port';
import { PasswordHasherPort } from '@/identity/application/ports/password-hasher.port';
import { AuthTokenPort } from '@/identity/application/ports/auth-token.port';
import { UserRepository } from '@/identity/infra/repositories/user.repository';
import { UserQuery } from '@/identity/infra/queries/user.query';
import { BcryptPasswordHasher } from '@/identity/infra/adapters/bcrypt-password-hasher';
import { JwtAuthTokenAdapter } from '@/identity/infra/adapters/jwt-auth-token.adapter';
import { RegisterUserHandler } from '@/identity/application/commands/handlers/register-user.command.handler';
import { LoginUserHandler } from '@/identity/application/commands/handlers/login-user.command.handler';
import { RefreshTokenHandler } from '@/identity/application/commands/handlers/refresh-token.command.handler';
import { GetCurrentUserHandler } from '@/identity/application/queries/handlers/get-current-user.query.handler';

const commandHandlers = [
  RegisterUserHandler,
  LoginUserHandler,
  RefreshTokenHandler,
];
const queryHandlers = [GetCurrentUserHandler];

/**
 * BC-7 Identity & Access. Binds every port to its impl in exactly ONE place,
 * registers the CQRS handlers + guards, and provides `JwtService` (secrets read
 * from config inside the token adapter). Imported into `AppModule`.
 */
@Module({
  imports: [CqrsModule, PrismaModule, JwtModule.register({})],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtCookieGuard,
    RolesGuard,
    { provide: UserRepositoryPort, useClass: UserRepository },
    { provide: UserQueryPort, useClass: UserQuery },
    { provide: PasswordHasherPort, useClass: BcryptPasswordHasher },
    { provide: AuthTokenPort, useClass: JwtAuthTokenAdapter },
    ...commandHandlers,
    ...queryHandlers,
  ],
})
export class IdentityModule {}

import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseFilters,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AUTH_THROTTLE } from '@/shared/throttler/throttler.config';
import {
  loginRequest,
  registerRequest,
  type AuthUser,
  type LoginRequest,
  type RegisterRequest,
} from '@harbourstay/shared';
import { ZodValidationPipe } from '@/shared/pipes/zod-validation.pipe';
import { AuthService } from '@/identity/application/services/auth.service';
import { IdentityExceptionFilter } from '@/identity/presenters/http/filters/identity-exception.filter';
import { JwtCookieGuard } from '@/identity/presenters/http/guards/jwt-cookie.guard';
import { CurrentUser } from '@/identity/presenters/http/decorators/current-user.decorator';
import {
  REFRESH_COOKIE,
  clearAuthCookies,
  setAuthCookies,
} from '@/identity/presenters/http/auth-cookies';

/**
 * BC-7 HTTP surface. Bodies are validated against the shared Zod contract;
 * tokens are set as httpOnly cookies and NEVER returned in the JSON body — the
 * response carries only the SAFE `AuthUser`. Domain rule breaks are mapped to
 * statuses by `IdentityExceptionFilter`.
 */
@ApiTags('auth')
@Controller('auth')
// TIGHTER rate limit than the global default (~10/min/IP vs ~100) on the whole auth
// surface — login/register/refresh are the brute-force & credential-stuffing targets.
// Class-level so a NEW auth route inherits the strict limit automatically; exceeding
// it → 429 before the handler (and before bcrypt/DB work). See `AUTH_THROTTLE`.
@Throttle(AUTH_THROTTLE)
@ApiTooManyRequestsResponse({ description: 'Rate limit exceeded (too many auth attempts).' })
@UseFilters(IdentityExceptionFilter)
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'Register a new guest or host; sets session cookies.' })
  @ApiCreatedResponse({ description: 'The newly-registered safe user.' })
  @ApiConflictResponse({ description: 'Email already in use.' })
  @UsePipes(new ZodValidationPipe(registerRequest))
  async register(
    @Body() body: RegisterRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthUser> {
    const result = await this.auth.register(body);
    setAuthCookies(res, result.tokens);
    return result.user;
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Authenticate; sets session cookies.' })
  @ApiOkResponse({ description: 'The authenticated safe user.' })
  @ApiUnauthorizedResponse({ description: 'Invalid credentials.' })
  @UsePipes(new ZodValidationPipe(loginRequest))
  async login(
    @Body() body: LoginRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthUser> {
    const result = await this.auth.login(body);
    setAuthCookies(res, result.tokens);
    return result.user;
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate tokens using the refresh cookie.' })
  @ApiOkResponse({ description: 'The safe user; fresh session cookies set.' })
  @ApiUnauthorizedResponse({ description: 'Missing/invalid refresh token.' })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthUser> {
    const token = (req.cookies as Record<string, string> | undefined)?.[
      REFRESH_COOKIE
    ];
    if (!token) {
      clearAuthCookies(res);
      throw new BadRequestException('Missing refresh token');
    }
    const result = await this.auth.refresh(token);
    setAuthCookies(res, result.tokens);
    return result.user;
  }

  @Get('me')
  @UseGuards(JwtCookieGuard)
  @ApiCookieAuth()
  @ApiOperation({ summary: 'The current authenticated user (protected route).' })
  @ApiOkResponse({ description: 'The safe current user.' })
  @ApiUnauthorizedResponse({ description: 'Not authenticated.' })
  me(@CurrentUser() user: AuthUser): Promise<AuthUser> {
    // Re-read via the CQRS read path so a token whose subject was deleted 404s.
    return this.auth.getCurrentUser(user.id);
  }
}

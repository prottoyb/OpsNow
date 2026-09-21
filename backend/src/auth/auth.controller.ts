import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags, ApiTooManyRequestsResponse } from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { CookieOptions, Request, Response } from 'express';
import { DEFAULT_REFRESH_TOKEN_TTL_SECONDS } from '../config/env.validation';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { AuthenticatedUser } from './types/jwt-payload.interface';

const REFRESH_COOKIE_NAME = 'refresh_token';
const REFRESH_COOKIE_PATH = '/api/v1/auth';

/*
 * `@UseGuards(ThrottlerGuard)` below is applied to the three routes that
 * either accept credentials or mint a token, and to no others (ADR-026).
 *
 * `GET /auth/me` is excluded on purpose: an authenticated SPA calls it on
 * every load, and it reveals nothing the caller does not already hold a
 * valid access token for. `POST /auth/logout` is excluded because
 * throttling it could strand a user in a session they are trying to end.
 *
 * The throttle counts every attempt, successful or not. Counting only
 * failures would let an attacker reset the window by interleaving logins
 * to an account they already control.
 */

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  private readonly refreshCookieMaxAgeMs: number;
  private readonly isProduction: boolean;

  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {
    this.refreshCookieMaxAgeMs =
      this.configService.get<number>(
        'REFRESH_TOKEN_TTL_SECONDS',
        DEFAULT_REFRESH_TOKEN_TTL_SECONDS,
      ) * 1000;
    this.isProduction =
      this.configService.get<string>('NODE_ENV') === 'production';
  }

  @Public()
  @UseGuards(ThrottlerGuard)
  @ApiTooManyRequestsResponse({ description: 'Auth endpoint rate limit exceeded.' })
  @Post('register')
  async register(@Body() dto: RegisterDto, @Req() req: Request) {
    const { user } = await this.authService.register(
      dto,
      this.requestMeta(req),
    );
    return user;
  }

  @Public()
  @UseGuards(ThrottlerGuard)
  @ApiTooManyRequestsResponse({ description: 'Auth endpoint rate limit exceeded.' })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(dto, this.requestMeta(req));
    this.setRefreshCookie(res, result.refreshToken);
    return { accessToken: result.accessToken, user: result.user };
  }

  @Public()
  @UseGuards(ThrottlerGuard)
  @ApiTooManyRequestsResponse({ description: 'Auth endpoint rate limit exceeded.' })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.assertTrustedOrigin(req);
    const rawToken = this.readRefreshCookie(req);
    const result = await this.authService.refresh(
      rawToken,
      this.requestMeta(req),
    );
    this.setRefreshCookie(res, result.refreshToken);
    return { accessToken: result.accessToken };
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.assertTrustedOrigin(req);
    const rawToken = req.cookies?.[REFRESH_COOKIE_NAME] as string | undefined;
    if (rawToken) {
      await this.authService.logout(rawToken, this.requestMeta(req));
    }
    res.clearCookie(REFRESH_COOKIE_NAME, { path: REFRESH_COOKIE_PATH });
  }

  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return user;
  }

  private readRefreshCookie(req: Request): string {
    const rawToken = req.cookies?.[REFRESH_COOKIE_NAME] as string | undefined;
    if (!rawToken) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    return rawToken;
  }

  private requestMeta(req: Request) {
    return {
      ipAddress: req.ip,
      userAgent: req.get('user-agent') ?? undefined,
    };
  }

  /**
   * Defense-in-depth CSRF check alongside the refresh cookie's
   * SameSite=Strict attribute (security.md allows either as a complete
   * mitigation): if a browser-supplied Origin header is present, it must
   * match this server's own Host. Absent Origin (non-browser clients)
   * is allowed through — there is no configured allowed-origin list to
   * check against until CORS is introduced (Phase 16).
   */
  private assertTrustedOrigin(req: Request): void {
    const origin = req.get('origin');
    if (!origin) {
      return;
    }

    let originHost: string;
    try {
      originHost = new URL(origin).host;
    } catch {
      throw new ForbiddenException('Invalid origin');
    }

    if (originHost !== req.get('host')) {
      throw new ForbiddenException('Cross-origin request rejected');
    }
  }

  private setRefreshCookie(res: Response, rawToken: string): void {
    const options: CookieOptions = {
      httpOnly: true,
      secure: this.isProduction,
      sameSite: 'strict',
      path: REFRESH_COOKIE_PATH,
      maxAge: this.refreshCookieMaxAgeMs,
    };
    res.cookie(REFRESH_COOKIE_NAME, rawToken, options);
  }
}

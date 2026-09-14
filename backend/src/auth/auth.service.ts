import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma, Role, User } from '@prisma/client';
import * as argon2 from 'argon2';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { DEFAULT_REFRESH_TOKEN_TTL_SECONDS } from '../config/env.validation';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtPayload } from './types/jwt-payload.interface';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface SafeUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
}

export interface RequestMeta {
  ipAddress?: string;
  userAgent?: string;
}

const INVALID_CREDENTIALS_MESSAGE = 'Invalid email or password';
const INVALID_REFRESH_TOKEN_MESSAGE = 'Invalid refresh token';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly refreshTtlSeconds: number;
  private dummyHash?: Promise<string>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {
    this.refreshTtlSeconds = this.configService.get<number>(
      'REFRESH_TOKEN_TTL_SECONDS',
      DEFAULT_REFRESH_TOKEN_TTL_SECONDS,
    );
  }

  async register(dto: RegisterDto): Promise<{ user: SafeUser }> {
    const passwordHash = await argon2.hash(dto.password, {
      type: argon2.argon2id,
    });

    try {
      const user = await this.usersService.create({
        email: dto.email,
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
      });
      return { user: this.toSafeUser(user) };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'An account with this email already exists',
        );
      }
      throw error;
    }
  }

  async login(
    dto: LoginDto,
    meta: RequestMeta,
  ): Promise<AuthTokens & { user: SafeUser }> {
    const user = await this.usersService.findByEmail(dto.email);

    if (!user) {
      // Verify against a dummy hash so an unknown email costs about the
      // same as a known email with the wrong password — otherwise
      // response timing leaks whether the account exists.
      await argon2.verify(await this.getDummyHash(), dto.password);
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }

    const passwordValid = await argon2.verify(user.passwordHash, dto.password);
    if (!passwordValid) {
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }

    if (!user.isActive) {
      // Safe to be specific here: reaching this branch already proves
      // the caller knows the correct password.
      throw new ForbiddenException('This account has been disabled');
    }

    await this.usersService.touchLastLogin(user.id);

    const tokens = await this.issueTokens(user, meta);
    return { ...tokens, user: this.toSafeUser(user) };
  }

  async refresh(rawToken: string, meta: RequestMeta): Promise<AuthTokens> {
    const tokenHash = this.hashToken(rawToken);
    const existing = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
    });

    if (!existing) {
      throw new UnauthorizedException(INVALID_REFRESH_TOKEN_MESSAGE);
    }

    if (existing.revokedAt) {
      if (existing.replacedById) {
        // This token was already consumed by a prior rotation and is
        // being presented again — a strong signal of token theft.
        // Revoke the whole family so both the legitimate client and a
        // possible attacker are forced to re-authenticate.
        await this.prisma.refreshToken.updateMany({
          where: { userId: existing.userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        this.logger.warn(
          `Refresh token reuse detected for user ${existing.userId}; all active refresh tokens revoked`,
        );
      }
      throw new UnauthorizedException(INVALID_REFRESH_TOKEN_MESSAGE);
    }

    if (existing.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Refresh token expired');
    }

    const user = await this.usersService.findById(existing.userId);
    if (!user || !user.isActive) {
      throw new UnauthorizedException(INVALID_REFRESH_TOKEN_MESSAGE);
    }

    const newTokenId = randomUUID();
    const newRawToken = randomBytes(64).toString('hex');
    const newTokenHash = this.hashToken(newRawToken);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.refreshTtlSeconds * 1000);

    await this.prisma.$transaction(async (tx) => {
      // The child must exist before the parent can point replacedById
      // at it (a DB foreign-key constraint enforces this). The
      // conditional update below still gates the rotation on the parent
      // being unrevoked at the moment of the write, so if it loses a
      // race, rolling back the transaction removes this orphaned child
      // along with it — no dangling unlinked token is left behind.
      await tx.refreshToken.create({
        data: {
          id: newTokenId,
          userId: user.id,
          tokenHash: newTokenHash,
          expiresAt,
          ipAddress: meta.ipAddress,
          userAgent: meta.userAgent,
        },
      });

      // Conditional update gates rotation on the token still being
      // unrevoked at the moment of the write (not just at the read
      // above), so two concurrent requests for the same token can never
      // both succeed — only one wins the race, closing the double-
      // rotation gap a plain read-then-write would leave open.
      const rotated = await tx.refreshToken.updateMany({
        where: { id: existing.id, revokedAt: null },
        data: { revokedAt: now, replacedById: newTokenId },
      });

      if (rotated.count !== 1) {
        throw new UnauthorizedException(INVALID_REFRESH_TOKEN_MESSAGE);
      }
    });

    return {
      accessToken: this.signAccessToken(user),
      refreshToken: newRawToken,
    };
  }

  async logout(rawToken: string): Promise<void> {
    const tokenHash = this.hashToken(rawToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async issueTokens(
    user: User,
    meta: RequestMeta,
  ): Promise<AuthTokens> {
    const rawToken = randomBytes(64).toString('hex');
    const tokenHash = this.hashToken(rawToken);
    const expiresAt = new Date(Date.now() + this.refreshTtlSeconds * 1000);

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      },
    });

    return {
      accessToken: this.signAccessToken(user),
      refreshToken: rawToken,
    };
  }

  private signAccessToken(user: User): string {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };
    return this.jwtService.sign(payload);
  }

  private hashToken(rawToken: string): string {
    return createHash('sha256').update(rawToken).digest('hex');
  }

  private getDummyHash(): Promise<string> {
    if (!this.dummyHash) {
      this.dummyHash = argon2.hash(randomBytes(32).toString('hex'), {
        type: argon2.argon2id,
      });
    }
    return this.dummyHash;
  }

  private toSafeUser(user: User): SafeUser {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
    };
  }
}

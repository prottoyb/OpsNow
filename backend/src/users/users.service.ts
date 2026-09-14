import { Injectable } from '@nestjs/common';
import { Role, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface CreateUserInput {
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
}

export interface SafeUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
}

export interface FindAllOptions {
  limit: number;
  offset: number;
}

export interface FindAllResult {
  data: SafeUser[];
  total: number;
}

/** Postgres's unique constraint on `email` is case-sensitive; normalize
 * consistently on every read and write so it behaves as case-insensitive. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /** Never returns a soft-deleted user. */
  async findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findFirst({
      where: { email: normalizeEmail(email), deletedAt: null },
    });
  }

  /** Never returns a soft-deleted user. */
  async findById(id: string): Promise<User | null> {
    return this.prisma.user.findFirst({
      where: { id, deletedAt: null },
    });
  }

  async create(input: CreateUserInput): Promise<User> {
    return this.prisma.user.create({
      data: {
        email: normalizeEmail(input.email),
        passwordHash: input.passwordHash,
        firstName: input.firstName,
        lastName: input.lastName,
      },
    });
  }

  async touchLastLogin(id: string): Promise<void> {
    await this.prisma.user.update({
      where: { id },
      data: { lastLoginAt: new Date() },
    });
  }

  /** Paginated, safe-fields-only listing. Never includes soft-deleted
   * users or `passwordHash`. */
  async findAll({ limit, offset }: FindAllOptions): Promise<FindAllResult> {
    const where = { deletedAt: null };
    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        take: limit,
        skip: offset,
        // A tie-breaker on `id` keeps pagination stable even if multiple
        // rows share the same `createdAt` (e.g. a future bulk insert).
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.user.count({ where }),
    ]);

    return { data: users.map(toSafeUser), total };
  }
}

export function toSafeUser(user: User): SafeUser {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
  };
}

import { Injectable } from '@nestjs/common'
import { PrismaService } from '../database/prisma.service'

const HANDLE_REGEX = /^[a-z0-9_]{3,30}$/;

export function normalizeHandle(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidHandle(handle: string): boolean {
  return HANDLE_REGEX.test(handle);
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async isHandleTaken(handle: string): Promise<boolean> {
    const normalized = normalizeHandle(handle);
    const existing = await this.prisma.user.findUnique({ where: { handle: normalized } });
    return existing !== null;
  }

  async updateHandle(userId: string, handle: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { handle: normalizeHandle(handle) },
    });
  }

  async updateName(userId: string, name: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { name: name.trim() },
    });
  }

  async updateSubscription(
    userId: string,
    data: {
      subscriptionStatus?: string;
      subscriptionOfferId?: string | null;
      stripeCustomerId?: string;
      stripeSubscriptionId?: string;
      currentPeriodEnd?: Date;
      trialEndsAt?: Date;
    },
  ) {
    return this.prisma.user.update({ where: { id: userId }, data });
  }
}

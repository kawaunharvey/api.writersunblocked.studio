import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async updateSubscription(
    userId: string,
    data: {
      subscriptionStatus?: string;
      stripeCustomerId?: string;
      stripeSubscriptionId?: string;
      currentPeriodEnd?: Date;
      trialEndsAt?: Date;
    },
  ) {
    return this.prisma.user.update({ where: { id: userId }, data });
  }
}

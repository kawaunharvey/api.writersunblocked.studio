import { Injectable, Logger } from "@nestjs/common"
import { PrismaService } from "../database/prisma.service"

@Injectable()
export class SubscriptionsService {
  private readonly stripe: any
  private readonly logger = new Logger(SubscriptionsService.name)

  constructor(private readonly prisma: PrismaService) {}

  async getUserSubscription(userId: string) {
    return this.prisma.userSubscription.findFirst({
      where: { userId },
    })
  }

}

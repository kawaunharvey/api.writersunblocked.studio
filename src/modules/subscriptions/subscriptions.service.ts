import { PrismaService } from "@/database/prisma.service"
import { Injectable, Logger } from "@nestjs/common"

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

import { Controller, Get, Logger, Param } from "@nestjs/common"
import { SubscriptionsService } from "./subscriptions.service"

@Controller('subscriptions')
export class SubscriptionsController {
  private readonly logger = new Logger(SubscriptionsController.name);

  constructor(private readonly subscriptions: SubscriptionsService) {}

  // This controller is now only responsible for receiving the webhook and delegating to the StripeService.
  // The actual logic for handling the subscription updates/deletions is moved to the StripeService to keep concerns separated.

  @Get('/:userId')
  async getUserSubscription(
    @Param('userId') userId: string,
  ) {
    return await this.subscriptions.getUserSubscription(userId);
  }
}

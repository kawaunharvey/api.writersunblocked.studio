import {
  Controller,
  Post,
  Req,
  Res,
  Headers,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { StripeService } from './stripe.service';

@Controller('webhooks')
export class StripeController {
  private readonly logger = new Logger(StripeController.name);

  constructor(private readonly stripeService: StripeService) {}

  @Public()
  @Post('stripe')
  async handleStripeWebhook(
    @Req() req: any,
    @Res() res: any,
    @Headers('stripe-signature') signature: string,
  ) {
    if (!signature) {
      throw new BadRequestException('Missing stripe-signature header');
    }

    let event: any;
    try {
      event = this.stripeService.constructWebhookEvent(req.body as Buffer, signature);
    } catch (err) {
      this.logger.error(`Webhook signature verification failed: ${err}`);
      return res.status(400).send(`Webhook Error: ${err}`);
    }

    try {
      switch (event.type) {
        case 'customer.subscription.updated':
          await this.stripeService.handleSubscriptionUpdated(
            event.data.object,
          );
          break;
        case 'customer.subscription.deleted':
          await this.stripeService.handleSubscriptionDeleted(
            event.data.object,
          );
          break;
        default:
          this.logger.debug(`Unhandled Stripe event type: ${event.type}`);
      }
    } catch (err) {
      this.logger.error(`Error handling Stripe event ${event.type}: ${err}`);
      return res.status(500).send('Internal error');
    }

    return res.json({ received: true });
  }
}

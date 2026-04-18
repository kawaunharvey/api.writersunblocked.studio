import { Injectable, Logger } from '@nestjs/common';
import FormData from 'form-data';
import Mailgun from 'mailgun.js';
import { AppConfigService } from '../common/config/app-config.service';

@Injectable()
export class MailgunService {
  private readonly client: ReturnType<InstanceType<typeof Mailgun>['client']>;
  private readonly logger = new Logger(MailgunService.name);

  constructor(private readonly config: AppConfigService) {
    const mailgun = new Mailgun(FormData);
    this.client = mailgun.client({
      username: 'api',
      key: this.config.mailgunApiKey,
    });
  }

  private async send(to: string, subject: string, html: string) {
    try {
      await this.client.messages.create(this.config.mailgunDomain, {
        from: this.config.mailgunFrom,
        to,
        subject,
        html,
      });
    } catch (err) {
      this.logger.error(`Failed to send email to ${to}: ${err}`);
    }
  }

  async sendWelcome(to: string, name: string | null) {
    await this.send(
      to,
      'Welcome to Writers Unblocked',
      `<p>Hi ${name ?? 'there'},</p><p>Welcome to Writers Unblocked. Your 7-day trial has started.</p>`,
    );
  }

  async sendWaitlistWelcome(to: string, confirmationLink: string) {
    await this.send(
      to,
      'Welcome to the Writers Unblocked waitlist',
      `<p>Thanks for joining the Writers Unblocked waitlist.</p><p>Please confirm your email and reserve your spot: <a href="${confirmationLink}">Confirm my spot</a>.</p>`,
    );
  }

  async sendTrialEnding(to: string, name: string | null, daysLeft: number) {
    await this.send(
      to,
      `Your Writers Unblocked trial ends in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`,
      `<p>Hi ${name ?? 'there'},</p><p>Your trial ends in ${daysLeft} day${daysLeft === 1 ? '' : 's'}. <a href="https://writersunblocked.studio/settings">Manage your subscription</a>.</p>`,
    );
  }

  async sendSubscriptionCanceled(to: string, name: string | null) {
    await this.send(
      to,
      'Your Writers Unblocked subscription has ended',
      `<p>Hi ${name ?? 'there'},</p><p>Your subscription has been canceled. Your stories are safe — <a href="https://writersunblocked.studio/settings">resubscribe any time</a>.</p>`,
    );
  }
}

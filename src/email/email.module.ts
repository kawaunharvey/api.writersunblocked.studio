import { Module } from '@nestjs/common';
import { MailgunService } from './mailgun.service';
import { AppConfigModule } from '../common/config/config.module';

@Module({
  imports: [AppConfigModule],
  providers: [MailgunService],
  exports: [MailgunService],
})
export class EmailModule {}

import { AppConfigService } from '@/common/config/app-config.service';
import { Injectable, Logger } from '@nestjs/common';
import type { LanguageToolResponse } from './editor-analysis.types';

export class LanguageToolUnavailableError extends Error {
  constructor(message = 'LanguageTool is unavailable') {
    super(message);
    this.name = 'LanguageToolUnavailableError';
  }
}

@Injectable()
export class LanguageToolClient {
  private readonly logger = new Logger(LanguageToolClient.name);

  constructor(private readonly config: AppConfigService) {}

  async check(text: string): Promise<LanguageToolResponse> {
    const url = this.config.languageToolUrl;
    const body = new URLSearchParams({
      text,
      language: 'en-US',
    });

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(`LanguageTool request failed: ${response.status} ${errorText}`);
        throw new LanguageToolUnavailableError(
          `LanguageTool request failed with status ${response.status}`,
        );
      }

      return (await response.json()) as LanguageToolResponse;
    } catch (error) {
      if (error instanceof LanguageToolUnavailableError) {
        throw error;
      }

      this.logger.error(
        `LanguageTool connection failed at ${url}. Run "yarn dev:services" in the API repo.`,
        error,
      );
      throw new LanguageToolUnavailableError();
    }
  }
}

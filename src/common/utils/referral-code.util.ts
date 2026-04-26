import { ConflictException } from '@nestjs/common'
import { randomBytes } from 'crypto'

const REFERRAL_CODE_LENGTH = 8;

/**
 * Generates a unique 8-character alphanumeric referral code.
 * @param isUnique - Async callback that returns true if the generated code is not yet taken.
 */
export async function generateReferralCode(
  isUnique: (code: string) => Promise<boolean>,
): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = randomBytes(8)
      .toString('base64')
      .replace(/[^a-zA-Z0-9]/g, '')
      .slice(0, REFERRAL_CODE_LENGTH)
      .toUpperCase();

    if (code.length !== REFERRAL_CODE_LENGTH) {
      continue;
    }

    if (await isUnique(code)) {
      return code;
    }
  }

  throw new ConflictException('Could not generate referral code. Please retry.');
}

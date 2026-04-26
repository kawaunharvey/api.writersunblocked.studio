/**
 * Backfill script: create a Referral record for every User that doesn't have one.
 *
 * Run with:
 *   npx ts-node -r tsconfig-paths/register prisma/scripts/backfill-user-referrals.ts
 */
import { PrismaClient } from '@prisma/client'
import { generateReferralCode } from '../../src/common/utils/referral-code.util'

const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    where: { referral: null },
    select: { id: true, email: true },
  });

  console.log(`Found ${users.length} users without a Referral record.`);

  let created = 0;
  let failed = 0;

  for (const user of users) {
    try {
      const code = await generateReferralCode(async (candidate) => {
        const existing = await prisma.referral.findUnique({ where: { referralCode: candidate } });
        return existing === null;
      });

      await prisma.referral.create({
        data: { userId: user.id, referralCode: code },
      });

      console.log(`  Created Referral ${code} for user ${user.id} (${user.email})`);
      created += 1;
    } catch (err) {
      console.error(`  Failed for user ${user.id} (${user.email}):`, err);
      failed += 1;
    }
  }

  console.log(`\nDone. Created: ${created}, Failed: ${failed}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

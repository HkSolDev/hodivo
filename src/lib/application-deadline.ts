import { indiaDateKey } from '../../frontend/india-date.js';
import type { Prisma } from '../../generated/prisma/index.js';

export function activeApplicationWhere(
  now = new Date(),
): Prisma.PostWhereInput {
  // Stored deadlines are calendar dates. Keep today's jobs until midnight IST.
  const today = indiaDateKey(now);
  return {
    OR: [
      { applicationLastDate: null },
      { applicationLastDate: { gte: new Date(`${today}T00:00:00Z`) } },
    ],
  };
}

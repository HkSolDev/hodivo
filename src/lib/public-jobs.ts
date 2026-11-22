import { publicJobPresentation } from './public-job-presentation.js';
import { prisma } from '../db.js';
import type { Prisma } from '../../generated/prisma/index.js';
import type { JobFilters } from '../../frontend/public-job-filters.js';
import { activeApplicationWhere } from './application-deadline.js';

// Shared by the JSON API and HTML catalogue; never select user/profile data.
export const publicFields = {
  id: true,
  postName: true,
  organization: true,
  postGroup: true,
  payLevel: true,
  vacancies: true,
  applicationLastDate: true,
  ageAsOnDate: true,
  minAge: true,
  maxAge: true,
  educationRequired: true,
  minEducationLevel: true,
  minMarksPercent: true,
  source: {
    select: {
      name: true,
      url: true,
      notificationPdfUrl: true,
      officialSiteUrl: true,
      applyUrl: true,
      fetchedAt: true,
    },
  },
} satisfies Prisma.PostSelect;

export type PublicJob = Prisma.PostGetPayload<{ select: typeof publicFields }>;

export function listPublicJobs(
  page: number,
  pageSize: number,
  filters?: JobFilters,
  database: typeof prisma = prisma,
  now = new Date(),
  visitorCounts?: ReadonlyMap<string, number>,
) {
  const conditions: Prisma.PostWhereInput[] = [activeApplicationWhere(now)];
  if (filters?.q) {
    const keyword = filters.q.replace(/[\\%_]/g, '\\$&');
    conditions.push({
      OR: [
        { postName: { contains: keyword, mode: 'insensitive' } },
        { educationRequired: { contains: keyword, mode: 'insensitive' } },
        { organization: { contains: keyword, mode: 'insensitive' } },
      ],
    });
  }
  if (filters?.qualification) {
    conditions.push({
      OR: [
        { minEducationLevel: filters.qualification },
        {
          eligibilityRules: {
            path: ['education_options'],
            array_contains: [{ minimum_level: filters.qualification }],
          },
        },
      ],
    });
  }
  const where: Prisma.PostWhereInput = { AND: conditions };
  // Sorting applies to the entire matching set before pagination.
  // Unknown values (missing deadline / unknown first publication) sort last.
  const orderBy: Prisma.PostOrderByWithRelationInput[] = filters
    ? filters.sort === 'newest' || filters.sort === 'popular'
      ? [{ publishedAt: { sort: 'desc', nulls: 'last' } }, { id: 'asc' }]
      : [
          {
            applicationLastDate: {
              sort: filters.sort === 'soonest' ? 'asc' : 'desc',
              nulls: 'last',
            },
          },
          { id: 'asc' },
        ]
    : [{ postName: 'asc' }, { id: 'asc' }];
  // Count and rows share a snapshot while the extraction pipeline updates jobs.
  return database.$transaction(
    async (db) => {
      const totalItems = await db.post.count({ where });
      const skip = (page - 1) * pageSize;
      const select = { ...publicFields, reviewedDetails: true } as const;
      const posts = await (async () => {
        if (filters?.sort !== 'popular' || !visitorCounts?.size) {
          return db.post.findMany({
            skip,
            take: pageSize,
            where,
            orderBy,
            select,
          });
        }
        const candidates = await db.post.findMany({
          where: { AND: [where, { id: { in: [...visitorCounts.keys()] } }] },
          orderBy,
          select: { id: true },
        });
        // Stable sort keeps publication time and ID as tie-breakers.
        candidates.sort(
          (a, b) =>
            (visitorCounts.get(b.id) ?? 0) - (visitorCounts.get(a.id) ?? 0),
        );
        const rankedIds = candidates
          .slice(skip, skip + pageSize)
          .map(({ id }) => id);
        const ranked = rankedIds.length
          ? await db.post.findMany({ where: { id: { in: rankedIds } }, select })
          : [];
        const byId = new Map(ranked.map((job) => [job.id, job]));
        const ordered = rankedIds.flatMap((id) => {
          const job = byId.get(id);
          return job ? [job] : [];
        });
        const remaining = pageSize - ordered.length;
        if (remaining > 0) {
          ordered.push(
            ...(await db.post.findMany({
              where: {
                AND: [where, { id: { notIn: candidates.map(({ id }) => id) } }],
              },
              orderBy,
              skip: Math.max(0, skip - candidates.length),
              take: remaining,
              select,
            })),
          );
        }
        return ordered;
      })();
      const data = posts.map((post) => {
        const reviewed = post.reviewedDetails as Record<string, unknown> | null;
        const appointmentType =
          typeof reviewed?.employment_type === 'string' &&
          reviewed.employment_type.trim()
            ? reviewed.employment_type.trim()
            : null;
        const { reviewedDetails: _, ...item } = publicJobPresentation(post);
        return {
          ...item,
          appointmentType,
        };
      });
      return {
        data,
        pagination: {
          page,
          pageSize,
          totalItems,
          totalPages: Math.ceil(totalItems / pageSize),
        },
      };
    },
    { isolationLevel: 'RepeatableRead', maxWait: 10_000, timeout: 15_000 },
  );
}

export async function getPublicJob(
  id: string,
  database: typeof prisma = prisma,
) {
  const job = await database.post.findUnique({
    where: { id },
    select: {
      ...publicFields,
      reviewedDetails: true,
      eligibilityRules: true,
      categoryRelaxationApplies: true,
      categoryRelaxationRules: true,
    },
  });
  return job ? publicJobPresentation(job) : null;
}

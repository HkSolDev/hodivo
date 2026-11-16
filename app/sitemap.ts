import { connection } from 'next/server';
import type { MetadataRoute } from 'next';
import type { JobsApiResponse } from '../components/jobs/catalogue-grid';
import type { PublicJobItem } from '../components/jobs/job-card';
import {
  DEFAULT_PRODUCTION_ORIGIN,
  isSafeJobId,
  jobShareUrl,
  trustedPublicOrigin,
} from '../components/jobs/job-sharing';

const SITEMAP_PAGE_SIZE = 100;
const SITEMAP_MAX_PAGES = 100;
const ISO_DATE_PREFIX_PATTERN = /^(\d{4}-\d{2}-\d{2})/;

const indiaFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Kolkata',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function sitemapIndiaDateKey(now = new Date()): string {
  const parts = indiaFormatter.formatToParts(now);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  if (!year || !month || !day) {
    throw new Error('Could not format India calendar date for sitemap.');
  }
  return `${year}-${month}-${day}`;
}

export function isSitemapEligibleJob(
  job: PublicJobItem,
  now = new Date(),
): boolean {
  if (!job || typeof job.id !== 'string' || !isSafeJobId(job.id)) {
    return false;
  }
  if (typeof job.postName !== 'string' || !job.postName.trim()) {
    return false;
  }
  if (!job.applicationLastDate || typeof job.applicationLastDate !== 'string') {
    return false;
  }
  const match = ISO_DATE_PREFIX_PATTERN.exec(job.applicationLastDate.trim());
  if (!match) {
    return false;
  }
  const deadlineDateKey = match[1];
  const todayKey = sitemapIndiaDateKey(now);
  return deadlineDateKey >= todayKey;
}

export function buildSitemapEntries(
  jobs: PublicJobItem[],
  options: { origin?: string; now?: Date } = {},
): MetadataRoute.Sitemap {
  const baseOrigin =
    trustedPublicOrigin(options.origin ?? process.env.SITE_URL, {
      allowLocalhost: false,
      fallbackOrigin: DEFAULT_PRODUCTION_ORIGIN,
    }) ?? DEFAULT_PRODUCTION_ORIGIN;
  const now = options.now ?? new Date();

  const staticEntries: MetadataRoute.Sitemap = [
    { url: new URL('/', baseOrigin).href },
    { url: new URL('/how-it-works', baseOrigin).href },
    { url: new URL('/typing', baseOrigin).href },
    { url: new URL('/typing/exam', baseOrigin).href },
  ];

  const seenUrls = new Set<string>(staticEntries.map((entry) => entry.url));
  const jobUrls: string[] = [];

  for (const job of jobs) {
    if (!isSitemapEligibleJob(job, now)) {
      continue;
    }
    const url = jobShareUrl(job.id.trim(), baseOrigin);
    if (!seenUrls.has(url)) {
      seenUrls.add(url);
      jobUrls.push(url);
    }
  }

  jobUrls.sort((a, b) => a.localeCompare(b));

  return [
    ...staticEntries,
    ...jobUrls.map((url): MetadataRoute.Sitemap[number] => ({ url })),
  ];
}

async function fetchSitemapJobsPage(
  backendUrl: string,
  page: number,
  fetchImpl: typeof fetch,
): Promise<JobsApiResponse> {
  const url = `${backendUrl}/api/jobs?sort=soonest&page=${page}&pageSize=${SITEMAP_PAGE_SIZE}`;
  const res = await fetchImpl(url, {
    next: { revalidate: 3600 },
  });
  if (!res.ok) {
    throw new Error(
      `Sitemap upstream /api/jobs failed with status ${res.status}`,
    );
  }
  const body = (await res.json()) as JobsApiResponse;
  if (!body || !Array.isArray(body.data)) {
    throw new Error('Sitemap upstream /api/jobs returned an invalid payload.');
  }
  if (body.freshnessUnconfirmed) {
    throw new Error('Sitemap refused unconfirmed stale catalogue data.');
  }
  return body;
}

export async function generateSitemap(
  options: {
    origin?: string;
    backendUrl?: string;
    now?: Date;
    fetchImpl?: typeof fetch;
  } = {},
): Promise<MetadataRoute.Sitemap> {
  const backendUrl =
    options.backendUrl ||
    process.env.BACKEND_INTERNAL_URL ||
    'http://127.0.0.1:8081';
  const fetchImpl = options.fetchImpl ?? fetch;

  const firstPage = await fetchSitemapJobsPage(backendUrl, 1, fetchImpl);
  if (firstPage.designReview) {
    return buildSitemapEntries([], {
      origin: options.origin,
      now: options.now,
    });
  }

  const allJobs: PublicJobItem[] = [...firstPage.data];
  const totalPages = Math.min(
    Math.max(1, Number(firstPage.pagination?.totalPages) || 1),
    SITEMAP_MAX_PAGES,
  );

  for (let page = 2; page <= totalPages; page += 1) {
    const nextPage = await fetchSitemapJobsPage(backendUrl, page, fetchImpl);
    if (nextPage.designReview) {
      break;
    }
    allJobs.push(...nextPage.data);
  }

  return buildSitemapEntries(allJobs, {
    origin: options.origin,
    now: options.now,
  });
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection();
  return generateSitemap();
}

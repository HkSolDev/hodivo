import type { Metadata } from 'next';
import { indiaDateKey } from '../../frontend/india-date';
import { isSafeJobId } from '../../frontend/job-id';
import { splitQualificationPoints } from '../../lib/jobs/format-qualification';
import type { JobDetailData } from './job-detail-content';

export { isSafeJobId };

export const DEFAULT_PRODUCTION_ORIGIN = 'https://hodivo.app';

export const HOME_SEO_TITLE =
  'Hodivo — Indian Government Jobs, Eligibility & Official Notifications';

export const HOME_SEO_DESCRIPTION =
  'Discover live Indian government job notifications across central, state, PSU, banking, defence and research roles. Compare education and age eligibility, check vacancies and application deadlines, and verify official recruitment links.';

export const HOW_IT_WORKS_SEO_TITLE = 'How It Works';

export const HOW_IT_WORKS_SEO_DESCRIPTION =
  'Understand how Hodivo matches government job notifications, what eligibility details are compared, and what to verify in the official recruitment notice before applying.';

function isLocalhostHost(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  return lower === 'localhost' || lower === '127.0.0.1' || lower === '[::1]';
}

function isStagingOrPreviewHost(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  if (
    lower === '0.0.0.0' ||
    lower.endsWith('.local') ||
    lower.endsWith('.internal')
  ) {
    return true;
  }
  const labels = lower.split('.');
  return labels.some(
    (label) =>
      label === 'staging' ||
      label === 'stage' ||
      label === 'preview' ||
      label.startsWith('staging-') ||
      label.endsWith('-staging') ||
      label.startsWith('preview-') ||
      label.endsWith('-preview'),
  );
}

export function stripBrandSuffix(value: string): string {
  let current = value.trim();
  while (/\s*[|—-]\s*Hodivo$/i.test(current)) {
    current = current.replace(/\s*[|—-]\s*Hodivo$/i, '').trim();
  }
  return current;
}

export function parseTrustedOriginUrl(
  origin: string,
  options: { allowLocalhost?: boolean } = {},
): URL {
  const allowLocalhost = options.allowLocalhost ?? true;
  const base = new URL(origin);
  if (
    !['https:', 'http:'].includes(base.protocol) ||
    base.username ||
    base.password ||
    base.pathname !== '/' ||
    base.search ||
    base.hash
  ) {
    throw new Error('SITE_URL must be an HTTP(S) public origin.');
  }
  const isLocal = isLocalhostHost(base.hostname);
  if (isLocal && !allowLocalhost) {
    throw new Error(
      'Localhost origin is not allowed for production discovery output.',
    );
  }
  if (!isLocal && base.protocol !== 'https:') {
    throw new Error('Non-localhost SITE_URL must use HTTPS.');
  }
  if (isStagingOrPreviewHost(base.hostname)) {
    throw new Error(
      'Staging or preview origins are not allowed as canonical origins.',
    );
  }
  return base;
}

export function trustedPublicOrigin(
  origin = process.env.SITE_URL,
  options: { allowLocalhost?: boolean; fallbackOrigin?: string } = {},
): string | undefined {
  const candidate = origin?.trim();
  if (!candidate) {
    return options.fallbackOrigin;
  }
  try {
    return parseTrustedOriginUrl(candidate, options).origin;
  } catch {
    return options.fallbackOrigin;
  }
}

export function jobShareUrl(id: string, origin: string): string {
  return new URL(`/jobs/${encodeURIComponent(id)}`, origin).href;
}

export function jobMetadata(job: JobDetailData, origin?: string): Metadata {
  const reviewed = job.reviewedDetails;
  const rawOrganization = reviewed?.recruiting_body ?? job.organization;
  const postName =
    stripBrandSuffix(job.postName) || 'Government Job Notification';
  const organization = rawOrganization
    ? stripBrandSuffix(rawOrganization)
    : undefined;
  const title = [postName, organization].filter(Boolean).join(' — ');
  const vacancies = reviewed?.vacancies ?? job.vacancies;
  const deadline = reviewed?.application_last_date ?? job.applicationLastDate;
  const rawEducation = job.educationRequired ?? reviewed?.education_required;
  const cleanEducation = (() => {
    const points = splitQualificationPoints(rawEducation);
    return points.length ? points.join('; ') : rawEducation;
  })();
  const description = [
    reviewed?.locations?.join(', '),
    cleanEducation,
    vacancies != null
      ? `${vacancies} ${vacancies === 1 ? 'vacancy' : 'vacancies'}`
      : null,
    deadline ? `Application deadline: ${deadline.slice(0, 10)}` : null,
    'View job details and verify the official notification.',
  ]
    .filter(Boolean)
    .join(' · ');
  if (!origin) return { title, description };
  const base = parseTrustedOriginUrl(origin);
  const url = jobShareUrl(job.id, base.origin);
  const image = {
    url: new URL('/share-image', base).href,
    width: 1200,
    height: 630,
    alt: 'Government job notification',
  };
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { type: 'website', title, description, url, images: [image] },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [image],
    },
  };
}

function isoCalendarDate(
  value: string | Date | null | undefined,
): string | null {
  if (!value) return null;
  const raw =
    value instanceof Date
      ? value.toISOString().slice(0, 10)
      : typeof value === 'string'
        ? value.trim().slice(0, 10)
        : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const parsed = new Date(`${raw}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== raw
    ? null
    : raw;
}

/**
 * Builds schema.org/JobPosting JSON-LD from verified job fields for search engines and AI Overviews.
 * Returns null when the official publication date is unknown or the vacancy deadline has passed.
 */
export function jobPostingJsonLd(
  job: JobDetailData,
  origin?: string,
  now = new Date(),
): Record<string, unknown> | null {
  const reviewed = job.reviewedDetails;
  const datePosted = isoCalendarDate(
    job.officialPostedDate ?? reviewed?.official_posted_date,
  );
  if (!datePosted) {
    return null;
  }

  const deadline = reviewed?.application_last_date ?? job.applicationLastDate;
  const validThrough = isoCalendarDate(deadline);
  if (validThrough && validThrough < indiaDateKey(now)) {
    return null;
  }

  const rawOrganization = reviewed?.recruiting_body ?? job.organization;
  const postName =
    stripBrandSuffix(job.postName) || 'Government Job Notification';
  const organization = rawOrganization
    ? stripBrandSuffix(rawOrganization)
    : undefined;
  const vacancies = reviewed?.vacancies ?? job.vacancies;
  const rawEducation = job.educationRequired ?? reviewed?.education_required;
  const educationPoints = splitQualificationPoints(rawEducation);
  const educationText = educationPoints.length
    ? educationPoints.join('; ')
    : rawEducation?.trim();
  const locations = reviewed?.locations?.filter(Boolean) ?? [];
  const base = parseTrustedOriginUrl(origin ?? DEFAULT_PRODUCTION_ORIGIN);
  const url = jobShareUrl(job.id, base.origin);

  const descriptionParts = [
    organization ? `Recruiting body: ${organization}` : null,
    educationText ? `Qualification: ${educationText}` : null,
    vacancies != null
      ? `Vacancies: ${vacancies.toLocaleString('en-IN')}`
      : null,
    validThrough ? `Apply by: ${validThrough}` : null,
    locations.length ? `Locations: ${locations.join(', ')}` : null,
  ].filter(Boolean);

  const jsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'JobPosting',
    title: postName,
    description:
      descriptionParts.join(' · ') ||
      `${postName} government recruitment notification on Hodivo.`,
    datePosted,
    url,
    mainEntityOfPage: url,
  };

  if (organization) {
    jsonLd.hiringOrganization = {
      '@type': 'Organization',
      name: organization,
    };
  }
  if (validThrough) {
    jsonLd.validThrough = validThrough;
  }
  if (vacancies != null && vacancies > 0) {
    jsonLd.totalJobOpenings = vacancies;
  }
  if (locations.length) {
    jsonLd.jobLocation = locations.map((loc) => ({
      '@type': 'Place',
      address: {
        '@type': 'PostalAddress',
        addressLocality: loc,
        addressCountry: 'IN',
      },
    }));
  }

  return jsonLd;
}

export function publicPageMetadata(options: {
  title: string;
  description: string;
  pathname: string;
  origin?: string;
  absoluteTitle?: boolean;
  robots?: Metadata['robots'];
}): Metadata {
  const cleanTitle = stripBrandSuffix(options.title);
  const title: Metadata['title'] = options.absoluteTitle
    ? { absolute: options.title.trim() }
    : cleanTitle;
  const socialTitle = options.absoluteTitle
    ? options.title.trim()
    : `${cleanTitle} | Hodivo`;

  const resolvedOrigin =
    trustedPublicOrigin(options.origin, {
      allowLocalhost: false,
      fallbackOrigin: DEFAULT_PRODUCTION_ORIGIN,
    }) ?? DEFAULT_PRODUCTION_ORIGIN;
  const url = new URL(options.pathname, resolvedOrigin).href;
  const image = {
    url: new URL('/share-image', resolvedOrigin).href,
    width: 1200,
    height: 630,
    alt: 'Hodivo — Indian government jobs discovery',
  };

  return {
    title,
    description: options.description,
    alternates: { canonical: url },
    openGraph: {
      type: 'website',
      title: socialTitle,
      description: options.description,
      url,
      images: [image],
    },
    twitter: {
      card: 'summary_large_image',
      title: socialTitle,
      description: options.description,
      images: [image],
    },
    ...(options.robots ? { robots: options.robots } : {}),
  };
}

export function homeCatalogMetadata(
  rawSearchParams: Record<string, string | string[] | undefined>,
  origin?: string,
): Metadata {
  const displayValues: Record<string, readonly string[]> = {
    sort: ['newest'],
    layout: ['rows', 'cards'],
    recLayout: ['rows', 'cards'],
    recSort: ['soonest', 'furthest'],
  };
  const keys = Object.keys(rawSearchParams).filter((key) => {
    const value = rawSearchParams[key];
    if (value === undefined) return false;
    return !(typeof value === 'string' && displayValues[key]?.includes(value));
  });
  const rawPage = rawSearchParams.page;
  const pageValue = Array.isArray(rawPage) ? rawPage[0] : rawPage;
  const isPositiveIntPage =
    typeof pageValue === 'string' &&
    !Array.isArray(rawPage) &&
    /^[1-9]\d*$/.test(pageValue.trim());
  const pageNumber = isPositiveIntPage ? Number(pageValue) : null;
  const isSafePage =
    pageNumber !== null &&
    Number.isSafeInteger(pageNumber) &&
    pageNumber <= 10000;

  const isCleanRoot = keys.length === 0;
  const isCleanPaginatedPage =
    keys.length === 1 && keys[0] === 'page' && isSafePage && pageNumber > 1;

  if (isCleanRoot) {
    return publicPageMetadata({
      title: HOME_SEO_TITLE,
      description: HOME_SEO_DESCRIPTION,
      pathname: '/',
      origin,
      absoluteTitle: true,
    });
  }

  if (isCleanPaginatedPage && pageNumber !== null) {
    return publicPageMetadata({
      title: `Indian Government Jobs — Page ${pageNumber}`,
      description: `Browse page ${pageNumber} of live Indian government job notifications on Hodivo, with qualification routes, deadlines, vacancies, and official recruitment links.`,
      pathname: `/?page=${pageNumber}`,
      origin,
    });
  }

  return publicPageMetadata({
    title: HOME_SEO_TITLE,
    description: HOME_SEO_DESCRIPTION,
    pathname: '/',
    origin,
    absoluteTitle: true,
    robots: {
      index: false,
      follow: true,
    },
  });
}

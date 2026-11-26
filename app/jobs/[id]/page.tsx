import { cache } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import {
  DEFAULT_PRODUCTION_ORIGIN,
  isSafeJobId,
  jobMetadata,
  jobPostingJsonLd,
  trustedPublicOrigin,
} from '../../../components/jobs/job-sharing';
import {
  JobDetailContent,
  type JobDetailData,
} from '../../../components/jobs/job-detail-content';

type JobDetailFetchResult =
  | { status: 'ok'; job: JobDetailData }
  | { status: 'not_found' }
  | { status: 'unavailable' };

const fetchJobDetail = cache(async function fetchJobDetail(
  id: string,
): Promise<JobDetailFetchResult> {
  if (!isSafeJobId(id)) {
    return { status: 'not_found' };
  }
  const backendUrl =
    process.env.BACKEND_INTERNAL_URL || 'http://127.0.0.1:8081';
  try {
    const res = await fetch(
      `${backendUrl}/api/jobs/${encodeURIComponent(id.trim())}`,
      {
        next: { revalidate: 60 },
      },
    );
    if (res.status === 404 || res.status === 400) {
      return { status: 'not_found' };
    }
    if (!res.ok) {
      return { status: 'unavailable' };
    }
    const job = (await res.json()) as JobDetailData;
    if (
      !job ||
      typeof job.id !== 'string' ||
      typeof job.postName !== 'string'
    ) {
      return { status: 'unavailable' };
    }
    return { status: 'ok', job };
  } catch {
    return { status: 'unavailable' };
  }
});

export async function generateMetadata(props: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const params = await props.params;
  const result = await fetchJobDetail(params.id);
  if (result.status === 'not_found') {
    return {
      title: 'Job Not Found',
      description:
        'The requested government job notification could not be found on Hodivo.',
      robots: {
        index: false,
        follow: false,
      },
    };
  }
  if (result.status === 'unavailable') {
    throw new Error('Job details temporarily unavailable');
  }
  const metadata = jobMetadata(
    result.job,
    trustedPublicOrigin(process.env.SITE_URL, {
      allowLocalhost: false,
      fallbackOrigin: DEFAULT_PRODUCTION_ORIGIN,
    }),
  );
  if (result.job.designReview) {
    return {
      ...metadata,
      robots: {
        index: false,
        follow: false,
      },
    };
  }
  return metadata;
}

export default async function JobDetailPage(props: {
  params: Promise<{ id: string }>;
}) {
  const params = await props.params;
  const result = await fetchJobDetail(params.id);

  if (result.status === 'not_found') {
    notFound();
  }

  if (result.status === 'unavailable') {
    throw new Error('Job details temporarily unavailable');
  }

  const origin =
    trustedPublicOrigin(process.env.SITE_URL, {
      allowLocalhost: false,
      fallbackOrigin: DEFAULT_PRODUCTION_ORIGIN,
    }) ?? DEFAULT_PRODUCTION_ORIGIN;
  const jsonLd = !result.job.designReview
    ? jobPostingJsonLd(result.job, origin)
    : null;

  return (
    <>
      {jsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c'),
          }}
        />
      ) : null}
      <JobDetailContent job={result.job} />
    </>
  );
}

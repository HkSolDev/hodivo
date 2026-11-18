import { isSafeJobId } from '../components/jobs/job-sharing';
import {
  RESIZE_DESCRIPTION,
  RESIZE_PATH,
  RESIZE_TITLE,
} from './prepare-file/seo';
import type { JobDetailData } from '../components/jobs/job-detail-content';

interface MediaRange {
  type: string;
  q: number;
  index: number;
}

function parseAcceptHeader(acceptHeader: string): MediaRange[] {
  return acceptHeader
    .split(',')
    .map((part, index) => {
      const segments = part.trim().split(';');
      const type = segments[0]?.trim().toLowerCase() ?? '';
      let q = 1;
      for (const seg of segments.slice(1)) {
        const [key, val] = seg.trim().split('=');
        if (key?.toLowerCase() === 'q' && val !== undefined) {
          const parsed = Number.parseFloat(val);
          if (!Number.isNaN(parsed)) {
            q = Math.max(0, Math.min(1, parsed));
          }
        }
      }
      return { type, q, index };
    })
    .filter((entry) => entry.type.length > 0);
}

/**
 * Returns true when the HTTP Accept header explicitly requests `text/markdown`
 * with a quality factor >= `text/html` (and > 0).
 */
export function prefersMarkdown(
  acceptHeader: string | null | undefined,
): boolean {
  if (!acceptHeader) return false;
  const ranges = parseAcceptHeader(acceptHeader);
  const md = ranges.find((r) => r.type === 'text/markdown');
  if (!md || md.q <= 0) return false;

  const html = ranges.find((r) => r.type === 'text/html');
  if (!html || html.q <= 0) return true;

  if (md.q > html.q) return true;
  if (md.q === html.q) return md.index < html.index;
  return false;
}

function publicLink(value: string | null | undefined): string | undefined {
  if (!value) return;
  try {
    const url = new URL(value);
    if (
      ['https:', 'http:'].includes(url.protocol) &&
      !url.username &&
      !url.password
    ) {
      return url.href.replace(/[<>]/g, encodeURIComponent);
    }
  } catch {
    return undefined;
  }
}

async function fetchJobMarkdown(
  id: string,
  backendUrl: string,
  fetchImpl: typeof fetch,
): Promise<{ status: number; markdown: string }> {
  const notFound = { status: 404, markdown: '# Job Not Found\n' };
  const unavailable = {
    status: 503,
    markdown: '# Job details temporarily unavailable\n',
  };
  try {
    const res = await fetchImpl(
      `${backendUrl}/api/jobs/${encodeURIComponent(id)}`,
      { headers: { Accept: 'application/json' }, next: { revalidate: 60 } },
    );
    if (res.status === 404 || res.status === 400) return notFound;
    if (!res.ok) return unavailable;
    const job = (await res.json()) as JobDetailData;
    if (!job || typeof job.postName !== 'string' || !job.postName.trim())
      return unavailable;
    if (job.designReview) return notFound;
    const reviewed = job.reviewedDetails;
    const employer = job.organization || reviewed?.recruiting_body;
    const education = job.educationRequired ?? reviewed?.education_required;
    const deadline = job.applicationLastDate ?? reviewed?.application_last_date;
    const vacancies = reviewed?.vacancies ?? job.vacancies;
    const minAge = job.minAge ?? reviewed?.min_age;
    const maxAge = job.maxAge ?? reviewed?.max_age;
    const notice =
      publicLink(job.source?.notificationPdfUrl) ??
      publicLink(job.source?.url) ??
      publicLink(reviewed?.official_site_url);
    const apply =
      publicLink(reviewed?.apply_url) ?? publicLink(job.source?.applyUrl);
    const lines = [
      `# ${job.postName}`,
      '',
      employer && `- **Organization**: ${employer}`,
      education && `- **Education**: ${education}`,
      deadline && `- **Application deadline**: ${deadline.slice(0, 10)}`,
      vacancies != null && `- **Vacancies**: ${vacancies}`,
      (minAge != null || maxAge != null) &&
        `- **Age limit**: ${minAge ?? '—'} to ${maxAge ?? '—'}`,
      notice && `- [Official recruitment notice](<${notice}>)`,
      apply && `- [Official application link](<${apply}>)`,
    ].filter((line): line is string => typeof line === 'string');
    return { status: 200, markdown: lines.join('\n') + '\n' };
  } catch {
    return unavailable;
  }
}

const STATIC_PAGES: Record<string, string> = {
  '/': [
    '# Aptus (Hodivo) — Indian Government Job Eligibility Matcher & Exam Typing Portal',
    '',
    'Hodivo (`https://hodivo.app`) helps applicants find Indian government job notifications (SSC, PSU, state PSC, banking, railways, defence) they are eligible for using deterministic rule matching, and provides a dedicated **Government Exam Typing Practice & Simulation Portal** (`/typing`).',
    '',
    '## Key Features & Pages',
    '',
    '- **Live Job Eligibility Directory (`/`)**: Browse and filter verified Indian government job notifications by education, category, and age limit.',
    '- **Government Exam Typing Practice (`/typing`)**: Timed typing practice with published passages and speed and accuracy feedback.',
    '- **Exam Typing Simulation (`/typing/exam`)**: Practice with reviewed duration and editing rules for available exams.',
    '- **How It Works (`/how-it-works`)**: Learn how deterministic eligibility matching and source-grounded extraction work.',
    `- [Resize files](${RESIZE_PATH}): Resize a photo or signature and compress PDFs to fit an upload limit on your device.`,
    '- **Applicant Profile (`/profile`)**: Save education qualifications, category, and date of birth for instant eligibility checks.',
    '- **Matched Results (`/results`) & Saved Jobs (`/saved`)**: Track live notifications you qualify for.',
    '',
  ].join('\n'),
  '/how-it-works': [
    '# How Aptus (Hodivo) Works',
    '',
    '1. Official Indian government recruitment notifications are parsed once into structured eligibility fields (age limits, education, category relaxation).',
    '2. Your profile (education, category, date of birth) is matched deterministically against those rules.',
    '3. Fields that are not specified in a notice are marked for manual verification rather than guessed.',
    '',
  ].join('\n'),
  '/typing': [
    '# Government Exam Typing Practice',
    '',
    'Canonical page: https://hodivo.app/typing',
    '',
    'Practice typing speed and accuracy with published passages or your own text. Choose a session duration and follow the highlighted passage. The practice view shows your time, net words per minute, accuracy and errors.',
    '',
    '- [Typing exam simulation](/typing/exam)',
    '- [Resize files](/tools/prepare-file)',
    '',
  ].join('\n'),
  '/typing/exam': [
    '# Government Exam Typing Simulation',
    '',
    'Choose a ready exam and passage to practise under its reviewed duration and editing rules. Available options depend on the published exam catalogue. Official scoring is unavailable.',
    '',
    '- [Typing practice](/typing)',
    '- [Resize files](/tools/prepare-file)',
    '',
  ].join('\n'),
  [RESIZE_PATH]: [
    `# ${RESIZE_TITLE}`,
    '',
    RESIZE_DESCRIPTION,
    '',
    '1. Choose a JPG, PNG, WebP, HEIC, HEIF or PDF. The input limit is 50 MB total.',
    '2. Choose JPG or PDF and enter the form’s maximum file size. One KB is 1,000 bytes. JPG also supports optional exact pixel dimensions and a minimum size.',
    '3. Check the preview and the measured size before downloading.',
    '',
    'Compressing an existing PDF rasterizes its pages. Small text may become less sharp, and selectable text and links are lost. If the result exceeds the limit, the tool shows the smallest result found and disables download for that limit.',
    '',
  ].join('\n'),
};

function publicJobId(pathname: string): string | undefined {
  const match = /^\/jobs\/([^/]+)$/.exec(pathname);
  return match && isSafeJobId(match[1]) ? match[1] : undefined;
}

export function hasPublicMarkdown(pathname: string): boolean {
  const normalized = pathname.replace(/\/$/, '') || '/';
  return (
    Object.hasOwn(STATIC_PAGES, normalized) || Boolean(publicJobId(normalized))
  );
}

export async function renderMarkdownForPath(
  pathname: string,
  options?: { backendUrl?: string; fetchImpl?: typeof fetch },
): Promise<{ status: number; markdown: string }> {
  const normalized =
    pathname.length > 1 && pathname.endsWith('/')
      ? pathname.slice(0, -1)
      : pathname;

  if (Object.hasOwn(STATIC_PAGES, normalized)) {
    return { status: 200, markdown: STATIC_PAGES[normalized] };
  }

  const jobId = publicJobId(normalized);
  if (jobId) {
    const backendUrl =
      options?.backendUrl ??
      process.env.BACKEND_INTERNAL_URL ??
      'http://127.0.0.1:8081';
    const fetchImpl = options?.fetchImpl ?? fetch;
    return fetchJobMarkdown(jobId, backendUrl, fetchImpl);
  }

  return {
    status: 404,
    markdown: `# Not Found\n\nNo markdown representation is available for \`${normalized}\`.\n`,
  };
}

import { isSafeJobId } from '../components/jobs/job-sharing';
import { splitQualificationPoints } from './jobs/format-qualification';
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
    const educationPoints = splitQualificationPoints(education);
    const deadline = job.applicationLastDate ?? reviewed?.application_last_date;
    const vacancies = reviewed?.vacancies ?? job.vacancies;
    const locations = reviewed?.locations?.filter(Boolean);
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
      locations &&
        locations.length > 0 &&
        `- **Locations**: ${locations.join(', ')}`,
      educationPoints.length > 1
        ? `- **Education**:\n${educationPoints.map((p) => `  - ${p}`).join('\n')}`
        : education && `- **Education**: ${education}`,
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
    '- **Free Global Typing Practice (`/typing`)**: Open to anyone worldwide—timed typing speed (WPM) and accuracy practice in your browser using custom text or published passages.',
    '- **Timed Exam Typing Simulation (`/typing/exam`)**: Practice with reviewed duration and editing rules for available exams.',
    '- **How It Works (`/how-it-works`)**: Learn how deterministic eligibility matching and source-grounded extraction work.',
    `- [Free Photo Resizer & PDF Compressor](${RESIZE_PATH}): Available worldwide—resize photos, convert images to PDF, and compress PDFs privately in your browser (with custom KB/pixel controls plus Indian exam presets).`,
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
    '# Free Online Typing Practice & Speed Test',
    '',
    'Canonical page: https://hodivo.app/typing',
    '',
    'Open to anyone worldwide—practice typing speed and accuracy directly in your browser with no signup required. Use published passages or paste your own custom text, choose a 1, 2, or 3 minute session, and track net WPM, accuracy, and errors.',
    '',
    '- [Typing exam simulation](/typing/exam)',
    '- [Free Photo Resizer & PDF Compressor](/tools/prepare-file)',
    '',
  ].join('\n'),
  '/typing/exam': [
    '# Timed Typing Exam Simulation',
    '',
    'Open to anyone worldwide—choose a ready exam and passage to practice under its reviewed duration and editing rules. Available options depend on the published exam catalogue. Official scoring is unavailable.',
    '',
    '- [Typing practice](/typing)',
    '- [Free Photo Resizer & PDF Compressor](/tools/prepare-file)',
    '',
  ].join('\n'),
  [RESIZE_PATH]: [
    `# ${RESIZE_TITLE}`,
    '',
    RESIZE_DESCRIPTION,
    '',
    '1. Pick an exam preset (**SSC**, **Railway (RRB)**, **UPSC**, **IBPS**, **NEET UG**, or **JEE Main**) and document type (Photo, Signature, Postcard, Thumb, or Certificate PDF), or use Custom settings.',
    '2. Choose a JPG, PNG, WebP, HEIC, HEIF or PDF. The input limit is 50 MB total.',
    '3. Set or adjust the form’s minimum and maximum file size in KB (1 KB = 1,000 bytes) and optional exact pixel dimensions for images.',
    '4. Check the preview and the measured size before downloading — everything runs locally in your browser.',
    '',
    'Compressing an existing PDF rasterizes its pages. Small text may become less sharp, and selectable text and links are lost. If the result exceeds the limit or falls below the minimum KB, the tool warns or disables download accordingly.',
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

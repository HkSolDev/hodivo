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

interface JobSummary {
  id?: string;
  postName?: string;
  organization?: string | null;
  educationRequired?: string | null;
  applicationDeadline?: string | null;
  officialUrl?: string | null;
  minAge?: number | null;
  maxAge?: number | null;
}

async function fetchJobMarkdown(
  id: string,
  backendUrl: string,
  fetchImpl: typeof fetch,
): Promise<{ status: number; markdown: string }> {
  try {
    const res = await fetchImpl(
      `${backendUrl}/api/jobs/${encodeURIComponent(id)}`,
      { headers: { Accept: 'application/json' } },
    );
    if (res.status === 404) {
      return {
        status: 404,
        markdown: `# Job Not Found\n\nNo job notification was found for \`${id}\`.\n`,
      };
    }
    if (!res.ok) {
      return {
        status: 200,
        markdown: `# Job Details (${id})\n\nUnable to load full job details right now. Visit \`/jobs/${id}\` in a browser.\n`,
      };
    }
    const job = (await res.json()) as JobSummary;
    const lines = [
      `# ${job.postName ?? `Job ${id}`}`,
      '',
      job.organization ? `- **Organization**: ${job.organization}` : null,
      job.educationRequired
        ? `- **Education**: ${job.educationRequired}`
        : null,
      job.minAge != null || job.maxAge != null
        ? `- **Age Limit**: ${job.minAge ?? '—'} to ${job.maxAge ?? '—'}`
        : null,
      job.applicationDeadline
        ? `- **Application Deadline**: ${job.applicationDeadline}`
        : null,
      job.officialUrl ? `- **Official URL**: ${job.officialUrl}` : null,
      '',
    ].filter((line): line is string => line !== null);
    return { status: 200, markdown: lines.join('\n') };
  } catch {
    return {
      status: 200,
      markdown: `# Job Details (${id})\n\nUnable to reach the backend service right now.\n`,
    };
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
    '- **Government Exam Typing Practice (`/typing`)**: Distraction-free, zero-scroll typing practice built for SSC CHSL, SSC CGL Tier-II (DEST), RRB NTPC, Banking, State PSC, and Ministerial skill tests.',
    '- **Exam Typing Simulation (`/typing/exam`)**: Full government exam simulation mode with strict timing and official backspace/editing rules.',
    '- **How It Works (`/how-it-works`)**: Learn how deterministic eligibility matching and source-grounded extraction work.',
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
    '# Hodivo — Government Exam Typing Practice (`https://hodivo.app/typing`)',
    '',
    'A distraction-free, zero-scroll (`100dvh`) typing practice workspace engineered for Indian government typing and skill tests, including **SSC CHSL**, **SSC CGL Tier-II Data Entry Speed Test (DEST)**, **RRB NTPC**, **IBPS/SBI Banking**, **State PSC**, and **High Court / Ministerial Clerk** exams.',
    '',
    '## Why Practice Typing on Hodivo (`https://hodivo.app/typing`)',
    '',
    '- **Exam-Length Passages**: Practice with full-length passages modeled after official government typing skill tests.',
    '- **Live Word & Character Tracing**: Active word highlighting with real-time character-level accuracy feedback.',
    '- **Flexible Session Durations**: Quick presets (`1m`, `2m`, `3m`, `5m`, `10m`) plus an inline custom duration stepper (`1m` to `60m`).',
    '- **Real-Time HUD Metrics**: Live countdown timer, Net WPM, Gross WPM, Accuracy %, and Error count.',
    '- **Smart Pause & Resume**: Press `Esc` or click outside to pause (time away is not counted in Practice Mode); click the blurred workspace to resume immediately.',
    '- **Benchmark Coaching Summary**: Post-session breakdown color-coded against the **27 WPM** average floor and **35 WPM** government exam qualifying standard.',
    '',
    '## Related Typing Modes',
    '',
    '- **Practice Mode**: `https://hodivo.app/typing` (untimed pause support, customizable durations, instant error feedback)',
    '- **Exam Simulation Mode**: `https://hodivo.app/typing/exam` (strict exam countdown and reviewed editing rules)',
    '',
  ].join('\n'),
  '/typing/exam': [
    '# Hodivo — Government Exam Typing Simulation (`https://hodivo.app/typing/exam`)',
    '',
    'Simulate an official Indian government typing skill test (SSC CHSL, SSC CGL DEST, PSC, Clerk) under strict exam conditions with reviewed durations and editing rules.',
    '',
    '- **Practice Mode**: `https://hodivo.app/typing`',
    '- **Exam Simulation Mode**: `https://hodivo.app/typing/exam`',
    '',
  ].join('\n'),
  '/profile': [
    '# Applicant Profile',
    '',
    'Enter your education qualifications, category, and date of birth to check eligibility against live notifications.',
    '',
  ].join('\n'),
  '/results': [
    '# Eligibility Results',
    '',
    'View government job notifications matched against your applicant profile.',
    '',
  ].join('\n'),
  '/saved': [
    '# Saved Jobs',
    '',
    'View and manage your saved government job notifications.',
    '',
  ].join('\n'),
  '/sign-in': [
    '# Sign In',
    '',
    'Sign in to save your applicant profile and track job notifications.',
    '',
  ].join('\n'),
};

export async function renderMarkdownForPath(
  pathname: string,
  options?: { backendUrl?: string; fetchImpl?: typeof fetch },
): Promise<{ status: number; markdown: string }> {
  const normalized =
    pathname.length > 1 && pathname.endsWith('/')
      ? pathname.slice(0, -1)
      : pathname;

  if (normalized in STATIC_PAGES) {
    return { status: 200, markdown: STATIC_PAGES[normalized] };
  }

  const jobMatch = /^\/jobs\/([^/]+)$/.exec(normalized);
  if (jobMatch) {
    const backendUrl =
      options?.backendUrl ??
      process.env.BACKEND_INTERNAL_URL ??
      'http://127.0.0.1:8081';
    const fetchImpl = options?.fetchImpl ?? fetch;
    return fetchJobMarkdown(jobMatch[1], backendUrl, fetchImpl);
  }

  return {
    status: 404,
    markdown: `# Not Found\n\nNo markdown representation is available for \`${normalized}\`.\n`,
  };
}

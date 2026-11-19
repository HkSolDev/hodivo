export interface AttemptSnapshot {
  id: string;
  mode: 'PRACTICE' | 'EXAM';
  examVersionId: string | null;
  grossWpm: number;
  netWpm: number;
  accuracy: number;
  errorPercent: number;
  keystrokes: number;
  backspaceCount: number;
  durationMs: number;
  passedRule: boolean | null;
  createdAt: string;
}

export interface ModeSummary {
  attemptCount: number;
  lastAttempt: AttemptSnapshot | null;
  personalBest: AttemptSnapshot | null;
}

export interface PassageSummaryResponse {
  passageId: string;
  practice: ModeSummary;
  exam: ModeSummary;
}

export interface AttemptComparisonData {
  lastAttempt: AttemptSnapshot | null;
  personalBest: AttemptSnapshot | null;
  otherModeBest: AttemptSnapshot | null;
}

export interface SaveAttemptInput {
  passageId: string;
  mode: 'PRACTICE' | 'EXAM';
  examVersionId?: string | null;
  grossWpm: number;
  netWpm: number;
  accuracy: number;
  errorPercent: number;
  keystrokes: number;
  backspaceCount: number;
  durationMs: number;
  passedRule?: boolean | null;
}

export type SaveAttemptResult =
  | { status: 'saved'; comparison: AttemptComparisonData }
  | { status: 'unauthenticated' }
  | { status: 'error' };

export interface HistoryItem extends AttemptSnapshot {
  passageId: string;
  passageTitle: string;
  examVersionLabel: string | null;
}

export type FetchHistoryResult =
  | { status: 'ok'; items: HistoryItem[]; nextCursor: string | null }
  | { status: 'unauthenticated' }
  | { status: 'error' };

export async function saveTypingAttempt(
  input: SaveAttemptInput,
  signal?: AbortSignal,
): Promise<SaveAttemptResult> {
  try {
    const response = await fetch('/api/typing/attempts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(input),
      signal,
    });
    if (response.status === 401) {
      return { status: 'unauthenticated' };
    }
    if (!response.ok) {
      return { status: 'error' };
    }
    const data = (await response.json()) as {
      comparison?: AttemptComparisonData;
    };
    if (!data.comparison) {
      return { status: 'error' };
    }
    return { status: 'saved', comparison: data.comparison };
  } catch {
    return { status: 'error' };
  }
}

export async function fetchPassageSummary(
  passageId: string,
  signal?: AbortSignal,
): Promise<PassageSummaryResponse | null> {
  try {
    const response = await fetch(
      `/api/typing/passages/${encodeURIComponent(passageId)}/summary`,
      { cache: 'no-store', credentials: 'same-origin', signal },
    );
    if (!response.ok) return null;
    const data =
      (await response.json()) as Partial<PassageSummaryResponse> | null;
    if (
      !data ||
      typeof data.passageId !== 'string' ||
      typeof data.practice?.attemptCount !== 'number' ||
      typeof data.exam?.attemptCount !== 'number'
    ) {
      return null;
    }
    return data as PassageSummaryResponse;
  } catch {
    return null;
  }
}

export async function fetchTypingHistory(
  options: { limit?: number; cursor?: string } = {},
  signal?: AbortSignal,
): Promise<FetchHistoryResult> {
  try {
    const params = new URLSearchParams();
    if (options.limit) params.set('limit', String(options.limit));
    if (options.cursor) params.set('cursor', options.cursor);
    const qs = params.toString();
    const url = qs ? `/api/typing/history?${qs}` : '/api/typing/history';
    const response = await fetch(url, {
      cache: 'no-store',
      credentials: 'same-origin',
      signal,
    });
    if (response.status === 401) return { status: 'unauthenticated' };
    if (!response.ok) return { status: 'error' };
    const data = (await response.json()) as {
      items?: HistoryItem[];
      nextCursor?: string | null;
    };
    return {
      status: 'ok',
      items: Array.isArray(data.items) ? data.items : [],
      nextCursor: data.nextCursor ?? null,
    };
  } catch {
    return { status: 'error' };
  }
}

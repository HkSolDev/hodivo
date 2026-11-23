export interface LeaderboardPassageOption {
  id: string;
  title: string;
}

export interface LeaderboardEntry {
  rank: number;
  displayName: string;
  netWpm: number;
  accuracy: number;
  errorPercent: number;
  passedRule: boolean | null;
  createdAt: string;
  isCurrentUser: boolean;
}

export interface PassageLeaderboardResponse {
  passage: LeaderboardPassageOption;
  mode: 'PRACTICE' | 'EXAM';
  totalParticipants: number;
  entries: LeaderboardEntry[];
  me: {
    rank: number;
    entry: LeaderboardEntry;
  } | null;
}

export async function fetchLeaderboardPassages(
  signal?: AbortSignal,
): Promise<LeaderboardPassageOption[]> {
  const response = await fetch('/api/typing/leaderboard/passages', {
    cache: 'no-store',
    signal,
  });
  if (!response.ok) throw new Error('Could not load passages.');
  const data = (await response.json()) as {
    passages?: LeaderboardPassageOption[];
  };
  return Array.isArray(data.passages) ? data.passages : [];
}

export async function fetchPassageLeaderboard(
  passageId: string,
  mode: 'PRACTICE' | 'EXAM',
  signal?: AbortSignal,
): Promise<PassageLeaderboardResponse> {
  const response = await fetch(
    `/api/typing/passages/${encodeURIComponent(passageId)}/leaderboard?mode=${mode}`,
    { cache: 'no-store', credentials: 'same-origin', signal },
  );
  if (!response.ok) throw new Error('Could not load leaderboard.');
  return (await response.json()) as PassageLeaderboardResponse;
}

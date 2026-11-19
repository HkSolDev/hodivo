import { prisma } from '../db.js';
import type {
  PrismaClient,
  TypingAttemptMode,
} from '../../generated/prisma/index.js';
import { TYPING_ID_REGEX, TypingAttemptError } from './typing-attempts.js';

const LEADERBOARD_TTL_MS = 30 * 1000;
const PASSAGE_LIST_TTL_MS = 60 * 1000;
const CACHE_MAX = 200;

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
  mode: TypingAttemptMode;
  totalParticipants: number;
  entries: LeaderboardEntry[];
  me: {
    rank: number;
    entry: LeaderboardEntry;
  } | null;
}

interface RankedParticipant {
  authUserId: string;
  displayName: string;
  netWpm: number;
  accuracy: number;
  errorPercent: number;
  passedRule: boolean | null;
  createdAt: string;
}

interface CachedLeaderboard {
  passage: LeaderboardPassageOption;
  ranked: RankedParticipant[];
  expiresAt: number;
}

export type TypingLeaderboardDatabase = Pick<
  PrismaClient,
  'typingPassage' | 'typingAttempt'
>;

let cachedPassages: {
  items: LeaderboardPassageOption[];
  expiresAt: number;
} | null = null;
const leaderboardCache = new Map<string, CachedLeaderboard>();

function formatDisplayName(rawName: string | null | undefined): string {
  const trimmed = rawName?.trim();
  if (!trimmed) return 'Aspirant';
  return trimmed.length > 32 ? `${trimmed.slice(0, 31)}…` : trimmed;
}

function isBetterAttempt(
  candidate: RankedParticipant,
  current: RankedParticipant,
): boolean {
  if (candidate.netWpm !== current.netWpm) {
    return candidate.netWpm > current.netWpm;
  }
  if (candidate.errorPercent !== current.errorPercent) {
    return candidate.errorPercent < current.errorPercent;
  }
  return candidate.createdAt < current.createdAt;
}

export async function listLeaderboardPassages(
  db: TypingLeaderboardDatabase = prisma,
): Promise<LeaderboardPassageOption[]> {
  if (
    db === prisma &&
    cachedPassages &&
    cachedPassages.expiresAt > Date.now()
  ) {
    return cachedPassages.items;
  }

  const rows = await db.typingPassage.findMany({
    where: {
      status: 'PUBLISHED',
      examVersion: { status: 'PUBLISHED', language: 'en' },
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    take: 50,
    select: { id: true, title: true },
  });

  if (db === prisma) {
    cachedPassages = {
      items: rows,
      expiresAt: Date.now() + PASSAGE_LIST_TTL_MS,
    };
  }
  return rows;
}

export async function getPassageLeaderboard(
  passageId: string,
  mode: TypingAttemptMode,
  currentAuthUserId: string | null,
  db: TypingLeaderboardDatabase = prisma,
): Promise<PassageLeaderboardResponse> {
  if (!TYPING_ID_REGEX.test(passageId)) {
    throw new TypingAttemptError('Invalid passage ID.', 400);
  }

  const cacheKey = `${passageId}:${mode}`;
  let cached = db === prisma ? leaderboardCache.get(cacheKey) : undefined;
  if (cached && cached.expiresAt <= Date.now()) {
    leaderboardCache.delete(cacheKey);
    cached = undefined;
  }

  if (!cached) {
    const passage = await db.typingPassage.findUnique({
      where: { id: passageId },
      select: { id: true, title: true, status: true },
    });
    if (!passage || passage.status !== 'PUBLISHED') {
      throw new TypingAttemptError('Passage not found.', 404);
    }

    const attempts = await db.typingAttempt.findMany({
      where: { passageId, mode },
      orderBy: [
        { netWpm: 'desc' },
        { errorPercent: 'asc' },
        { createdAt: 'asc' },
      ],
      select: {
        authUserId: true,
        netWpm: true,
        accuracy: true,
        errorPercent: true,
        passedRule: true,
        createdAt: true,
        authUser: { select: { name: true } },
      },
    });

    const bestByUser = new Map<string, RankedParticipant>();
    for (const row of attempts) {
      const candidate: RankedParticipant = {
        authUserId: row.authUserId,
        displayName: formatDisplayName(row.authUser.name),
        netWpm: row.netWpm,
        accuracy: row.accuracy,
        errorPercent: row.errorPercent,
        passedRule: row.passedRule,
        createdAt: row.createdAt.toISOString(),
      };
      const existing = bestByUser.get(row.authUserId);
      if (!existing || isBetterAttempt(candidate, existing)) {
        bestByUser.set(row.authUserId, candidate);
      }
    }

    const ranked = Array.from(bestByUser.values()).sort((a, b) =>
      isBetterAttempt(a, b) ? -1 : isBetterAttempt(b, a) ? 1 : 0,
    );

    cached = {
      passage: { id: passage.id, title: passage.title },
      ranked,
      expiresAt: Date.now() + LEADERBOARD_TTL_MS,
    };

    if (db === prisma) {
      if (leaderboardCache.size >= CACHE_MAX) {
        const oldestKey = leaderboardCache.keys().next().value;
        if (oldestKey !== undefined) leaderboardCache.delete(oldestKey);
      }
      leaderboardCache.set(cacheKey, cached);
    }
  }

  const projectEntry = (
    item: RankedParticipant,
    index: number,
  ): LeaderboardEntry => ({
    rank: index + 1,
    displayName: item.displayName,
    netWpm: item.netWpm,
    accuracy: item.accuracy,
    errorPercent: item.errorPercent,
    passedRule: item.passedRule,
    createdAt: item.createdAt,
    isCurrentUser:
      currentAuthUserId !== null && item.authUserId === currentAuthUserId,
  });

  const entries = cached.ranked.slice(0, 20).map(projectEntry);

  let me: PassageLeaderboardResponse['me'] = null;
  if (currentAuthUserId) {
    const myIndex = cached.ranked.findIndex(
      (item) => item.authUserId === currentAuthUserId,
    );
    if (myIndex >= 0) {
      const myItem = cached.ranked[myIndex];
      if (myItem) {
        me = {
          rank: myIndex + 1,
          entry: projectEntry(myItem, myIndex),
        };
      }
    }
  }

  return {
    passage: cached.passage,
    mode,
    totalParticipants: cached.ranked.length,
    entries,
    me,
  };
}

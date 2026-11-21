import { prisma } from '../db.js';
import type {
  PrismaClient,
  TypingAttemptMode,
} from '../../generated/prisma/index.js';
import {
  getTypingAttemptRevision,
  isTypingCacheReady,
  promoteTypingBoard,
  readTypingAttemptCache,
} from './typing-passage-cache.js';
import {
  saveTypingAttempt,
  TYPING_ID_REGEX,
  TypingAttemptError,
  type SaveAttemptResponse,
  type SaveTypingAttemptInput,
  type TypingAttemptsDatabase,
} from './typing-attempts.js';

const PASSAGE_LIST_TTL_MS = 60 * 1000;

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
  attemptId: string;
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
}

export type TypingLeaderboardDatabase = Pick<
  PrismaClient,
  'typingPassage' | 'typingAttempt' | '$queryRaw'
>;

let cachedPassages: {
  items: LeaderboardPassageOption[];
  expiresAt: number;
} | null = null;

function formatDisplayName(rawName: string | null | undefined): string {
  const trimmed = rawName?.trim();
  if (!trimmed) return 'Aspirant';
  return trimmed.length > 32 ? `${trimmed.slice(0, 31)}…` : trimmed;
}

function compareParticipants(
  a: RankedParticipant,
  b: RankedParticipant,
): number {
  return (
    b.netWpm - a.netWpm ||
    a.errorPercent - b.errorPercent ||
    compareStrings(a.createdAt, b.createdAt) ||
    compareStrings(a.attemptId, b.attemptId)
  );
}

function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export type TypingAttemptWriteDatabase = TypingAttemptsDatabase &
  Partial<Pick<PrismaClient, '$transaction'>> & {
    authUser?: {
      findUnique(args: {
        where: { id: string };
        select: { name: true };
      }): Promise<{ name: string } | null>;
    };
  };

export async function saveAttemptAndRefreshBoard(
  authUserId: string,
  input: SaveTypingAttemptInput,
  db: TypingAttemptWriteDatabase = prisma,
): Promise<SaveAttemptResponse> {
  if (!isTypingCacheReady() || !db.$transaction || !db.authUser) {
    return saveTypingAttempt(authUserId, input, db);
  }

  const { passageId, mode } = input;
  const { previous, current, result } = await db.$transaction(
    async (tx) => {
      // Match the database trigger so these revisions bracket only this write.
      await tx.$queryRaw`
      SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${passageId + ':' + mode}, 0))
    `;
      const previous = await getTypingAttemptRevision(
        tx,
        passageId,
        'board',
        mode,
      );
      const result = await saveTypingAttempt(authUserId, input, tx);
      const current = await getTypingAttemptRevision(
        tx,
        passageId,
        'board',
        mode,
      );
      return { previous, current, result };
    },
    { isolationLevel: 'ReadCommitted' },
  );

  if (
    previous &&
    current &&
    previous.key !== current.key &&
    previous.content === current.content
  ) {
    // Cache or metadata failures must not turn a committed save into an error.
    try {
      const user = await db.authUser.findUnique({
        where: { id: authUserId },
        select: { name: true },
      });
      if (user) {
        const { id, netWpm, accuracy, errorPercent, passedRule, createdAt } =
          result.attempt;
        const entry = {
          attemptId: id,
          authUserId,
          displayName: formatDisplayName(user.name),
          netWpm,
          accuracy,
          errorPercent,
          passedRule,
          createdAt,
        };
        await promoteTypingBoard(
          previous.key,
          current.key,
          (board: CachedLeaderboard) => {
            const ranked = board.ranked.filter(
              (item) => item.authUserId !== authUserId,
            );
            const index = ranked.findIndex(
              (item) => compareParticipants(entry, item) < 0,
            );
            ranked.splice(index < 0 ? ranked.length : index, 0, entry);
            return { ...board, ranked };
          },
        );
      }
    } catch {
      // The committed revision will be rebuilt by the next read.
    }
  }

  return result;
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

  const cached = await readTypingAttemptCache(
    db,
    passageId,
    'board',
    mode,
    async (): Promise<CachedLeaderboard> => {
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
          { id: 'asc' },
        ],
        select: {
          id: true,
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
          attemptId: row.id,
          authUserId: row.authUserId,
          displayName: formatDisplayName(row.authUser.name),
          netWpm: row.netWpm,
          accuracy: row.accuracy,
          errorPercent: row.errorPercent,
          passedRule: row.passedRule,
          createdAt: row.createdAt.toISOString(),
        };
        const existing = bestByUser.get(row.authUserId);
        if (!existing || compareParticipants(candidate, existing) < 0) {
          bestByUser.set(row.authUserId, candidate);
        }
      }

      const ranked = Array.from(bestByUser.values()).sort(compareParticipants);

      return {
        passage: { id: passage.id, title: passage.title },
        ranked,
      };
    },
  );

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

import assert from 'node:assert/strict';
import { test } from 'node:test';
import Fastify from 'fastify';
import type { AppAuth } from '../src/auth/auth.js';
import {
  getPassageLeaderboard,
  listLeaderboardPassages,
  type TypingLeaderboardDatabase,
} from '../src/lib/typing-leaderboard.js';
import { registerTypingLeaderboardRoutes } from '../src/routes/typing-leaderboard.js';

function createFakeLeaderboardDb(): TypingLeaderboardDatabase {
  const attempts = [
    {
      id: 'attempt0',
      authUserId: 'u1',
      netWpm: 42,
      accuracy: 96,
      errorPercent: 4,
      passedRule: true,
      createdAt: new Date('2026-11-19T10:00:00Z'),
      authUser: { name: 'Aarav' },
    },
    {
      id: 'attempt1',
      authUserId: 'u1',
      netWpm: 35,
      accuracy: 92,
      errorPercent: 8,
      passedRule: false,
      createdAt: new Date('2026-11-19T09:00:00Z'),
      authUser: { name: 'Aarav' },
    },
    {
      id: 'attempt2',
      authUserId: 'u2',
      netWpm: 48,
      accuracy: 98,
      errorPercent: 2,
      passedRule: true,
      createdAt: new Date('2026-11-19T10:05:00Z'),
      authUser: { name: 'Priya' },
    },
  ];

  return {
    typingPassage: {
      findMany: async () => [{ id: 'pass1', title: 'SSC CHSL Test 1' }],
      findUnique: async ({ where }: { where: { id: string } }) =>
        where.id === 'pass1'
          ? { id: 'pass1', title: 'SSC CHSL Test 1', status: 'PUBLISHED' }
          : null,
    },
    typingAttempt: {
      findMany: async () => attempts,
    },
  } as unknown as TypingLeaderboardDatabase;
}

test('getPassageLeaderboard ranks best score per user and identifies current user', async () => {
  const db = createFakeLeaderboardDb();
  const passages = await listLeaderboardPassages(db);
  assert.equal(passages.length, 1);

  const board = await getPassageLeaderboard('pass1', 'EXAM', 'u1', db);
  assert.equal(board.totalParticipants, 2);
  assert.equal(board.entries[0]?.displayName, 'Priya');
  assert.equal(board.entries[0]?.rank, 1);
  assert.equal(board.entries[0]?.isCurrentUser, false);
  assert.equal(board.entries[1]?.displayName, 'Aarav');
  assert.equal(board.entries[1]?.netWpm, 42);
  assert.equal(board.entries[1]?.isCurrentUser, true);
  assert.equal(board.me?.rank, 2);
  assert.equal(board.me?.entry.netWpm, 42);
});

test('leaderboard routes work publicly and optionally attach signed-in rank', async (t) => {
  const db = createFakeLeaderboardDb();
  let signedInUser: string | null = null;
  const mockAuth = {
    api: {
      getSession: async () =>
        signedInUser
          ? {
              user: { id: signedInUser, email: 'a@example.com', name: 'Aarav' },
              session: {
                id: 's1',
                userId: signedInUser,
                expiresAt: new Date(Date.now() + 60_000),
              },
            }
          : null,
    },
  } as unknown as AppAuth;

  const app = Fastify();
  registerTypingLeaderboardRoutes(app, mockAuth, db);
  t.after(() => app.close());

  let res = await app.inject('/api/typing/leaderboard/passages');
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().passages[0].id, 'pass1');

  res = await app.inject('/api/typing/passages/pass1/leaderboard?mode=EXAM');
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().me, null);

  signedInUser = 'u1';
  res = await app.inject('/api/typing/passages/pass1/leaderboard?mode=EXAM');
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().me.rank, 2);

  res = await app.inject('/api/typing/passages/pass1/leaderboard?mode=BAD');
  assert.equal(res.statusCode, 400);

  res = await app.inject('/api/typing/passages/missing1/leaderboard?mode=EXAM');
  assert.equal(res.statusCode, 404);
});

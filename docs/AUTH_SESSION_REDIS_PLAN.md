# Auth Session Redis Plan (`secondaryStorage`)

Scheduled for **tomorrow** (after `feat/slave-db-read-split` is deployed and verified).

## Goal

Stop Better Auth session reads from hitting **Neon** on every authenticated or optional-auth request, while keeping users, OAuth accounts, passkeys, and writes in Neon.

## Why Redis (not NoSQL)

- A single Better Auth session is ~300–500 bytes; 10,000 active sessions ≈ 3–5 MB of RAM.
- Sessions have a 7-day TTL (`expiresIn: 7 * 24 * 60 * 60` in `src/auth/auth.ts`), so Redis automatically expires old keys.
- Redis with AOF (`--appendonly yes`) persists to disk across restarts, and `--maxmemory` caps RAM usage.
- Adding a separate disk-based NoSQL engine (MongoDB/Cassandra) would consume far more idle RAM without benefit at this scale.

## Current Neon Auth Read Sites (Keep Auth, Move Session Storage)

Do **not** remove `requireSession`, `requireOperator`, or `disableCookieCache: true` (revocation on sign-out must stay immediate). Move session storage from Neon `AuthSession` to Redis `secondaryStorage` for:

1. `src/routes/typing-leaderboard.ts` (`resolveOptionalUserId` -> `auth.api.getSession`)
2. `src/auth/require-session.ts` (`requireSession` -> `auth.api.getSession`)
3. `src/auth/require-operator.ts` (`requireOperator` -> `auth.api.getSession`)
4. `src/auth/routes.ts` (`GET /api/auth/get-session` -> `auth.handler`)

## Implementation Checklist (Local First -> Then Server)

1. **Redis isolation decision (`docker-compose.yml` + `.env`)**
   - Preferred: add a small `redis-auth` service (`redis:7-alpine`, `--appendonly yes`, `--maxmemory 128mb`, `--maxmemory-policy noeviction`) so public cache operations never touch auth sessions.
   - Simpler fallback: dedicated DB index on `redis-public` (`AUTH_REDIS_URL=redis://redis-public:6379/2`).
2. **Create `src/auth/secondary-storage.ts`**
   - Implement Better Auth `secondaryStorage` (`get`, `set` with `ttl`, `delete`) using `redis` (`^6.3.1`, already in `package.json`).
   - Fail closed on Redis errors so `requireSession` / `requireOperator` return `503` instead of silently passing.
3. **Wire into `src/auth/auth.ts` (`betterAuth` `1.7.7`)**
   - Pass `secondaryStorage` into `authOptions` when `AUTH_REDIS_URL` is set.
   - Verify `hooks.before` on `/sign-out` revokes the session token in Redis (and Neon if stored) and fails with `503` if revocation fails.
   - Decide whether to accept a one-time re-login for existing sessions or add a temporary Neon fallback read.
4. **Tests (run locally against Docker Redis)**
   - Sign-in stores session in Redis.
   - `getSession` / `requireSession` / `requireOperator` succeed without querying Neon `AuthSession`.
   - `/sign-out` deletes from Redis and immediately rejects subsequent requests (`401`).
   - Redis unreachable returns `503`.
5. **Deploy on server**
   - Create a clean branch from `main` / `feat/slave-db-read-split`.
   - Add `AUTH_REDIS_URL` (and `redis-auth` if used) on the server, then `docker compose up -d --build`.

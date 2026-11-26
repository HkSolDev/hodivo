# Slave DB Read Split & Event-Driven Sync

Public job and typing reads are offloaded from Neon (Master) to a self-hosted PostgreSQL 18 read-copy (**`slave-db`**) + Redis (**`redis-public`**), so Neon scales to zero when no writes occur.

---

## 1. How Reads & Writes Flow

- **Public Reads (`GET /api/jobs`, `GET /api/jobs/:id`, `GET /api/typing/*`, leaderboard):**
  1. `aptus-api` checks **`redis-public`** first (~1–5ms hit).
  2. Cache misses and version checks (`xmin`, `JobsListingRevision`, `TypingCacheRevision`, `TypingAttemptCacheRevision`) query **`prismaRead`** (`SLAVE_DATABASE_URL` → `slave-db`), **never Neon**.
  3. If `SLAVE_DATABASE_URL` is unset (or matches `DATABASE_URL`), `prismaRead` falls back to `prisma` (`DATABASE_URL`).
- **Writes (Ingest, Reviewed Publish, Typing Imports, Typing Attempts):**
  1. Code writes to **Neon (`prisma`)** first.
  2. After commit, `enqueueSyncEvents` (`src/lib/sync-queue.ts`) pushes `{ entityType, entityId }` onto the local Redis Stream **`hodivo:sync:v1`**.
  3. **`sync-worker`** (`src/worker/sync-worker.ts`) blocks on `XREADGROUP` (zero polling against Neon), fetches the updated row(s) from Neon, upserts/deletes them in `slave-db`, and notifies Next.js (`/api/revalidate-jobs`) for job updates.
  4. Postgres triggers in `slave-db` automatically bump `JobsListingRevision`, `TypingCacheRevision`, and `TypingAttemptCacheRevision` so affected Redis keys refresh without wiping unrelated cache entries.

---

## 2. Docker Compose Services (`docker-compose.yml`)

| Service | Container | Role | Port (default) |
| :--- | :--- | :--- | :--- |
| `slave-db` | `hodivo-slave-db` | `postgres:18-alpine` read-copy (`aptus_slave`, persistent volume `slave_db_data`) | `5432` (`POSTGRES_PORT`) |
| `redis-public` | `hodivo-redis-public` | `redis:7-alpine` with AOF persistence (`redis_public_data`) for caches + `hodivo:sync:v1` | `6379` (`REDIS_PORT`) |
| `aptus-api` | `hodivo-api` | Fastify API (`deployment/api.Dockerfile`) reading from `slave-db` + `redis-public` | `8080` (`API_PORT`) |
| `sync-worker` | `hodivo-sync-worker` | Same `deployment/api.Dockerfile` image running `src/worker/sync-worker.ts` (HTTP healthcheck disabled) | — |

### Key Environment Variables
- `DATABASE_URL`: Neon Master (writes, auth/users, review pipeline).
- `SLAVE_DATABASE_URL`: `postgresql://aptus:aptus@slave-db:5432/aptus_slave` (in Docker) or `postgresql://aptus:aptus@localhost:5432/aptus_slave` (host).
- `JOBS_REDIS_URL` / `TYPING_REDIS_URL` / `SYNC_REDIS_URL`: `redis://redis-public:6379`. *(Tip: set `SYNC_REDIS_URL=redis://redis-public:6379/1` if you want the sync stream isolated in Redis DB 1.)*

---

## 3. Logs & Monitoring

```sh
# Container health & status
docker compose ps

# Follow sync-worker logs (should show "sync-worker listening on hodivo:sync:v1")
docker logs -f hodivo-sync-worker

# Follow API logs
docker logs -f hodivo-api

# Inspect Redis Stream lag & pending messages
docker exec hodivo-redis-public redis-cli XINFO GROUPS hodivo:sync:v1
docker exec hodivo-redis-public redis-cli XLEN hodivo:sync:v1

# Inspect cached keys
docker exec hodivo-redis-public redis-cli KEYS "hodivo:*"
```

---

## 4. Operations & Maintenance

### Manual Full Catch-Up (`--backfill`)
Run after manual DB/SQL edits on Neon or if Redis was unreachable during a write:
```sh
SLAVE_DATABASE_URL=postgresql://aptus:aptus@localhost:5432/aptus_slave \
  node --import tsx --no-network-family-autoselection --env-file=.env src/worker/sync-worker.ts --backfill
```

### Importing Researched Jobs
Requires `--import tsx` so the script loads `src/lib/sync-queue.ts` and queues `slave-db` sync automatically:
```sh
node --import tsx --no-network-family-autoselection --env-file=.env scripts/import-researched-jobs.mjs <jobs.json>
```

### Adding a New Prisma Field / Migration
1. Apply Prisma migrations to **both** databases:
   - Neon (`DATABASE_URL`): `npx prisma migrate deploy --config prisma7.config.ts`
   - `slave-db` (`SLAVE_DATABASE_URL`): `DATABASE_URL="$SLAVE_DATABASE_URL" npx prisma migrate deploy --config prisma7.config.ts`
2. Rebuild `aptus-api` and `sync-worker` so the updated Prisma client is bundled.
3. If an API response payload changed, bump the cache version prefix (e.g., `v2` → `v3` in `src/lib/public-jobs-cache.ts`) or delete `hodivo:jobs:*` keys. **Avoid `FLUSHDB` on DB 0** while sharing DB 0 with `hodivo:sync:v1` (`sync-worker` self-heals `NOGROUP` automatically, but `FLUSHDB` drops queued events).

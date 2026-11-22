# Published practice catalogue and Redis

Branch `perf/typing-passage-cache` in `/private/tmp/hodivo-typing-passage-cache`.
Base `936c3f2`. The jobs-cache worktree has independent changes.

## Read and write paths

Graphify pointed to the typing catalogue and importer. Source confirmed that
practice accepts any supported English passage with both the passage and its
version published. The exam-only catalogue additionally requires review and
publication dates, matching content hashes, and some provenance. A practice
browser using that route would omit eligible content.

The import CLI calls the serializable importer and creates drafts. A conflicting
edit requires a new revision. The tracked baseline has no Fastify passage editor
or publisher. Direct SQL and scripts outside Fastify can change passage rows or
parent publication status. The cache migration observes both tables, including
direct updates, deletes and truncations. Rolled-back statements leave the
revision unchanged.

## Implementation

1. Keep the random endpoint and its response contract. Select a random eligible
   ID from the full set, then use the same detail reader as a visitor opening a
   direct link. Remove the previous process-local store of full passage text.
2. Add a 10-item keyset page of IDs and titles. The Browse passages control
   loads it on demand. Each result opens the existing practice UI with its
   passage ID. Browsing never preloads the listed text.
3. Use optional `TYPING_REDIS_URL` on Fastify. Catalogue and text keys have a
   five-minute TTL and include the committed PostgreSQL typing revision. The
   database advances the revision in the content transaction, so a failed write
   never invalidates and all API instances observe the same committed revision.
   An in-flight miss can only populate its original namespace. Old keys expire.
   Unavailable Redis uses the same PostgreSQL eligibility query.
4. The warm exact path performs one small PostgreSQL revision read and zero
   passage queries. This deliberately keeps publish/unpublish correct through a
   Redis outage or a writer outside the API. A typing write currently rotates
   the practice namespace, including other practice passages and draft imports.
   Exam keeps its own PostgreSQL visibility and readiness checks. See the shared
   text verification below.

## Verification and rollout

The opt-in production-mode integration test uses a disposable Redis instance
and the isolated `hodivo_typing_test` loopback database with repository
migrations applied. It writes synthetic passages and runs through the normal
Fastify HTTP routes. It counts catalogue and passage SQL separately from
revision reads and gates an actual database read during unpublish.

```sh
NODE_ENV=production TEST_TYPING_CACHE=1 \
DATABASE_URL=postgresql://LOCAL_DB_USER@127.0.0.1:55476/hodivo_typing_test \
TYPING_REDIS_URL=redis://127.0.0.1:56379 \
node --import tsx --test scripts/typing-passage-cache.test.ts
```

Local results: production Next build, lint, typecheck, and diff check passed.
The existing route/client and real PostgreSQL catalogue/import tests passed
(17 tests). The production integration passed with a loopback Redis 7 container
and Chrome at a 390 px viewport. It confirmed the 10 + 2 catalogue split,
on-demand text, zero passage SQL on a repeat open, immediate edit and publication
changes, rollback, and fallback through a paused Redis server. The read that
overlapped unpublish finished with its original data and wrote only the retired
revision. The next request returned 404 and the catalogue omitted the passage.

Apply the migration before setting `TYPING_REDIS_URL`. A dedicated private Redis
instance and production rollout require separate approval. Release the frontend
and Fastify routes together. Jobs, exam rules, leaderboard and progress are
outside this slice.

The final browser run also reloaded the same direct link after editing and after
unpublishing. It showed the edited text first, then disabled the typing field
when the passage became unavailable. The test container used `--rm` and was
stopped after verification. PostgreSQL and Next test listeners were stopped.

## Shared Practice and Exam text

Exam resolves eligible passage metadata and version readiness before reading
the existing Practice passage key. The cache revision lookup and any fallback
read use the same PostgreSQL repeatable-read snapshot as those checks. The
key stays `hodivo:typing:v1:<database revision>:text:<passage id>`. Exam
checks that the returned text matches the eligible row's SHA-256. Exam metadata,
rules, and readiness stay in PostgreSQL.

The production-mode HTTP integration passed with both registered Fastify
routes and real local PostgreSQL and Redis. Practice warmed passage 12 and
Exam opened that same ID. Exam executed one version query, one eligibility
query, one cache revision query, and zero text-body selects, plus transaction
control. The eligibility query still checks the stored text's length, character
set, and hash inside PostgreSQL. Passage 11 was warm in Practice but missing
review approval, and Exam returned 409. Both modes returned updated text after
a committed edit. After passage unpublish, Practice returned 404 and Exam 409.
After parent version unpublish both returned 404. Both modes returned the
expected text during separate Redis pauses. Six existing route and database
checks, lint, typecheck, and the diff check passed.

Follow-up design choices are reducing the PostgreSQL revision round trip and
narrowing invalidation to affected passages. The existing namespace rotation
still makes unrelated practice entries cold after a typing write. An Exam
cache miss now selects the text separately after its eligibility query.
Production rollout remains pending approval.

## Baseline leaderboard and private passage progress

1. The workspace already had the attempt and leaderboard handlers. This branch
   carries over those handlers, their tests, and the attempt-table migration,
   and registers the routes in Fastify.
2. The shared board is keyed by passage ID and mode. It keeps each user's best
   attempt by net WPM descending, error percentage ascending, then submission
   time ascending. Attempt ID breaks an exact timestamp tie. The response
   returns the first 20 entries and the viewer's rank even outside the first 20. It adds viewer fields after the shared cache lookup.
3. The authenticated summary key uses passage ID and the session's user ID.
   Its Practice and Exam summaries each include attempt count, latest attempt,
   and personal best. The route keeps its existing no-store response header.
4. The attempt migration rotates a PostgreSQL revision for that user's progress
   on every save. It rotates the passage-and-mode board revision only when the
   new row becomes that user's ranked best. Concurrent saves for a board
   serialize the best-score check. The revision and attempt commit together,
   so a rollback or Redis outage cannot leave a committed write behind a stale
   Redis key. A read in flight fills only its original revision. The existing
   content revision also retires entries after a passage publication change.
5. A cold board rebuilds with the existing PostgreSQL ranking logic. Updating
   individual Redis entries would add a second ranking implementation and a
   synchronization path for concurrent fills. The process-local ranked-board
   map was removed. Redis entries expire after 30 seconds.

The production-mode local integration used real Better Auth session lookup,
Fastify routes, PostgreSQL, and disposable Redis. On a signed-in warm read of
either route, Prisma recorded one session lookup and one revision query, with
zero ranking or summary queries. The first read after an affected revision
change executed one corresponding ranking or summary query. The anonymous
summary request returned 401 before any revision or summary query.

With both users' summaries and both modes' boards warm, Alice's lower attempt
invalidated only her summary. Her later improvement on error percentage gave
her rank 1 while the Exam board remained warm. The earlier timestamp won when
WPM and error percentage tied. Concurrent submissions preserved the best
score and the two viewers got their own rank from the same shared board.
Bob's attempt during a Redis pause appeared in both endpoints via PostgreSQL
and remained current after recovery. A passage unpublish returned 404 from
both endpoints. Both Redis integrations, 12 Redis-disabled regressions,
lint, typecheck, and the Git diff check passed.

Warm reads still perform a lightweight PostgreSQL revision lookup. Cold boards
still scan all attempts for that passage and mode. The inherited ranking
accepts client-reported scores within its existing validation bounds. Production
rollout requires approval and the attempt and revision migrations must be
applied before enabling the routes with Redis.

## Incremental refresh of a warm leaderboard

Graphify's existing project graph predates the attempt routes. The worktree
source connects the authenticated POST in `src/routes/typing-attempts.ts` to
`saveTypingAttempt`, the PostgreSQL attempt trigger, and the board promotion in
`src/lib/typing-leaderboard.ts`. The leaderboard GET reads its exact
passage-and-mode revision and projects the viewer from the shared board. The
existing frontend in the adjacent jobs-cache checkout renders `entries` as the
table and `me` separately. The HTTP response stayed the same.

1. While Redis is ready, the save takes the existing board advisory lock and
   reads the revision immediately before and after the normal attempt write.
   The trigger remains responsible for deciding whether the attempt beats the
   caller's ranked best. It also rotates the caller's private progress
   revision on every successful submission.
2. After commit, a changed board revision can reuse a complete predecessor in
   Redis. Copy its ranked list, remove the caller's former row, and insert the
   new best in order. WPM descends, error percentage ascends, then the attempt
   time and ID ascend. Keep the predecessor's absolute expiry. Redis 7 supplies
   that expiry and `SET NX` preserves a concurrent rebuild.
3. A promotion can write only to the specific revision produced by its
   transaction. A board fill checks that its revision survived the database
   read before caching the result. Missing or expired predecessors, out-of-order
   promotions, and Redis failures use the existing PostgreSQL rebuild. The
   browser gets the first 20 entries plus its current signed-in rank.

The production-mode Fastify integration used real Better Auth sessions,
PostgreSQL and Redis. The baseline's first read after an improvement ran one
ranking query. After promotion, Alice and Bob each read the correct order with
zero ranking queries, one session lookup and one revision lookup. The cold
rebuild now uses two revision lookups. Bob's score and warm progress and the
Exam board stayed intact. A lower attempt refreshed only Alice's progress.
The test covered tied scores, an exact timestamp tie, a viewer ranked 21st in a
20-row response, post-commit refreshes completing in reverse order, and a Redis
pause followed by recovery. Both cache integrations, all 12 focused
regressions, lint, typecheck, and the diff check passed locally.

A promotion reads and writes a whole Redis board value while changing one
participant. Cold boards still scan the passage-and-mode attempts. This slice
adds no dependency or migration. Production rollout requires approval.

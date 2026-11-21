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

# Typing draft catalogue: implementation and review

Date: 12 November 2026. Contract: `storage-draft-v1`, approved by Hemant's
“work on” instruction. Code frozen at local isolated commit
`15b47e8267c2c3150b904be4373ca984f751aceb`, based on snapshot `a600ef65`.
Status: **reviewed storage/import integrated locally on `codex/typing-practice-plan` from `5d46aaf1cd6d82778769914dd03d95dce60ccdb5`; no application database migration or deployment.**

## What this slice implements

Three separate Prisma models store exam identity, a version's rules, and exact
passage revisions. The additive migration does not change existing models or
seed data. Restrictive foreign keys preserve relationships. A version/passage
created through the import tool is always DRAFT; there is no publication path.

The import accepts one exam, one version and 1–20 passages. Every nullable input
key must be explicitly present. Unknown keys, caller-supplied status/hash/counts,
invalid numbers, unsupported policies, malformed Unicode and metadata controls
are rejected before DB access. Backspace accepts the approved enum or null;
editing/scoring methods remain null until a real supported exam is reviewed.

The file reader allocates at most 1 MiB + one byte for input, decodes UTF-8
strictly and allows one leading BOM. Passage CR/CRLF becomes LF; all other
spaces, tabs, punctuation and Unicode are preserved. SHA-256 covers canonical
UTF-8 text. Counts describe code points and Unicode-whitespace-delimited runs,
not official marking rules. The local preview returns canonical text and rules.

Dry-run only reads. Explicit apply uses a serializable transaction, inserts
missing identities, compares every imported semantic field and reads back the
bounded imported set before commit. Identical records are no-ops regardless of
status; differences are conflicts. No update/upsert or automatic retry exists.
This deliberately keeps draft corrections explicit as new keys/revisions.

## Team contribution and corrections

OpenCode GLM free wrote the initial schema, migration, modules and tests.
DeepSeek free independently confirmed concrete draft defects. The coordinator
corrected the backspace type/validation, CLI raw/parsed input confusion, metadata
checks, bounded file reading and queries, and simplified the store path to use
Prisma-generated types and shared inspection logic. Incorrect test fixtures
(code-point/URL boundaries) were corrected against the contract, without relaxing
its behavior. One coordinator assertion initially counted nine code points as ten;
manual enumeration corrected that test before the accepted run.

The initial GLM run and later clients stalled; written work was preserved and
only task-specific processes were interrupted. The installed OpenCode versions
inconsistently expose private-server flags, so final review uses the older
installed runner's documented `--pure` mode and isolated temporary state. Its
verified current catalogue exposes `opencode/deepseek-v4-flash-free`; the older
cached `opencode/deepseek-v4.1-flash-free` name did not resolve in that clean
profile, so the final review uses the available free DeepSeek model.
No model/provider upgrade or paid fallback was used.

[GLM rationale](agent-progress/typing-storage-glm-implementation.md),
[DeepSeek findings](agent-progress/typing-storage-deepseek-implementation-review.md),
and [batch record](AGENT_COORDINATION_2026-11-12-typing-storage-implementation.md)
retain separate historical and current evidence.

## Verification against the frozen code

| Check | Observed result |
| --- | --- |
| Complete typing-storage suite, explicit Node 24, disposable PostgreSQL 14.20 | 53 passed, 0 failed, 0 skipped |
| Existing backend + contract suite, explicit Node 24 and existing Python environment | 140 passed, 18 skipped, 0 failed |
| Existing practice pure/SSR/regression tests | 23 passed |
| Full repository lint in integration worktree | Passed |
| Prisma generate and validate | Passed; no DB operations |
| TypeScript check | Only existing `frontend/profile-api.ts:6` missing `.js` extension; clean typecheck remains blocked |
| Existing Prisma schema prefix | Byte-for-byte preserved before additive typing definitions |

The typing suite includes actual CLI preview/apply/repeat/conflict/argument
handling; full semantic read-back; identical published-record replay without
mutation; dry-run no writes; metadata/text conflicts; restrictive FKs; concurrent
identical and differing imports; and a database trigger that corrupts an insert,
proving read-back failure rolls back the entire file after real writes occurred.

The broader suite's database skips are separate from typing's explicitly executed
DB proof. Earlier broad runs failed on sandbox socket permissions and missing
Python in the isolated worktree; these were rerun with localhost permission and
a read-only launcher to the existing Python environment (bytecode writes disabled).
No dependency was installed. No tests or contract locks were weakened.

Logs are local temporary evidence: `/private/tmp/typing-storage-frozen-tests.log`,
`/private/tmp/typing-storage-full-verified-tests.log`,
`/private/tmp/typing-storage-practice-regression.log`, and
`/private/tmp/typing-storage-review-lint.log`.

## Operator use after a separately reviewed local migration

The CLI requires database configuration, including for dry-run conflict checks.
It does not load `.env` implicitly. From a configured checkout with a generated
client and the catalogue migration applied to the intended database:

```sh
pnpm exec tsx --env-file=.env scripts/import-typing-content.ts /path/to/draft.json
pnpm exec tsx --env-file=.env scripts/import-typing-content.ts /path/to/draft.json --apply
```

The first command is read-only. The second explicitly inserts drafts. Both exit
nonzero on conflict/failure and close their DB client; generic database errors do
not print connection strings or stacks. Review canonical text/rules in the preview
before applying. Reusing an identity with changed metadata or text is rejected.

Illustrative input only; not an official exam and not automatically seeded:

```json
{
  "exam": { "slug": "illustrative-exam", "name": "Illustrative exam", "organization": null },
  "version": {
    "versionKey": "draft-1", "label": "Unreviewed draft", "language": "en",
    "examYear": null, "durationSeconds": null, "backspacePolicy": null,
    "editingPolicy": null, "scoringMethod": null, "targetWpm": null,
    "maxErrorPercent": null, "targetKeystrokes": null, "instructions": null,
    "ruleSourceUrl": null, "ruleSourceNote": null
  },
  "passages": [{
    "contentKey": "sample", "revision": 1, "title": "Illustrative passage",
    "text": "An illustrative passage.\nSecond line kept exactly.",
    "examYear": null, "shift": null, "sourceKind": "PRACTICE",
    "sourceUrl": null, "sourceNote": null
  }]
}
```

## Current handoff and blocker

Implementation worktree: `/private/tmp/aptus-typing-storage-review`, branch
`codex/typing-storage-review-20261112`, frozen commit above. All 12 owned source,
migration and test paths are committed there. The original checkout's staged
index and original application files are unchanged; only planning/review docs
were updated. Source hashes are recorded in
`/private/tmp/typing-storage-accepted-code-manifest.json` (candidate bytes, not an
acceptance claim). The original Prisma schema prefix is preserved.

DeepSeek's preliminary code review completed and its findings were corrected.
Final review of the exact corrected commit did not complete: OpenCode clients
stalled; a clean profile rejected the cached v4.1 model name, and its verified
free v4 Flash model repeatedly logged provider/model request failures without
returning review output. No final DeepSeek acceptance is claimed. Isolated
OpenCode state contains no copied credentials. Shared services/settings were
left untouched; no paid fallback was used.

Resume by running the final free-model review against the exact commit and
addressing any findings. Then verify the frozen candidate hashes and original
schema/index baseline, copy only accepted paths, regenerate the original local
Prisma client, update Graphify and record integration. Do not start API work or
apply a shared/live migration to bypass this gate. Existing tests already passed;
rerun affected checks only if code/baseline changes or evidence needs refreshing.

## Remaining scope

No API routes, frontend/exam changes, attempt history, official content import,
publication, shared/live migration, image execution, push or deployment. The
operator script is repository tooling, not included in the API image. Runtime
server modules remain under the existing copied src tree.

Next: freeze the read API's exact projections, metadata-count storage/query,
ordering and empty-state behavior, then implement its three bounded public GETs.
The first official exam configuration is still decided with source evidence at
content entry. Database status fields are not a substitute for that review or
for implemented editing/scoring behavior.

## 12 November integration follow-up

Hemant requested GPT-6.1 Terra as the independent reviewer after free-provider
failures. [Terra's exact-commit review](agent-progress/typing-storage-terra-final-review.md)
identified one metadata validation gap: C1 controls in single-line fields.
The coordinator reproduced it with a failing regression, rejected the C1 range
in the shared single-line validator and extended the existing test across all
32 code points. Passage and multiline policies remain unchanged. Terra reviewed
fix commit `5d46aaf1cd6d82778769914dd03d95dce60ccdb5` and reported no remaining
code-review blockers. The earlier blocked handoff above is historical.

Exactly the 12 reviewed paths were copied into the original checkout after
verifying its schema baseline and staged-index hash. No snapshot merge or staging
was performed. Local Prisma generation/validation, lint and all 38 pure storage
tests pass after integration. Earlier 53-test disposable-database proof applies
to the pre-C1-fix candidate; database behavior is unchanged but those database
tests were not rerun for this validator-only fix. Root typecheck remains blocked
by the existing `frontend/profile-api.ts:6` missing `.js` import extension.

Storage/import is now complete locally. Public read API and exam UI are still
unimplemented. No shared/live migration, real content import or deployment.

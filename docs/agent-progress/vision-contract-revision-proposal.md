# Vision storage contract revision proposal — 9 November 2026

Status: proposed; awaiting Hemant approval. No lock or protected checks changed.

## Reproduction

`DOTENV_CONFIG_PATH=/dev/null pnpm test:contracts` rejects
`services/ai/candidate-storage.schema.json`: frozen SHA-256
`d6573617caf64705510772c9535641731ef548ee235814a04e6b05f96975226a`
versus current `af1d9b255dec8942d062c0d1dd247c5d533e2f3eb3fd3eff430558eea828d9ef`.
The Vision implementation added schema fields before revising the frozen lock.

## Proposed change

Retain existing required fields and unknown/null semantics. Approve the already
implemented optional nullable `review.reader_summary`, `official_syllabus`,
`historical_cutoffs`, `enrichment_candidates`, `vision_recovery`, and
`automated_decision`, plus their referenced typed definitions. An old review
without these properties remains valid. A Vision review may additionally include
`automated_decision` with decision accepted/blocked/retryable, reason codes,
evidence fingerprint, and extraction version. Optional metadata never bypasses
the automated gate or authorizes legacy reviewed publication.

Affected paths: Python store_candidate and generated storage schema; TypeScript
storage validator and autonomous ingestion; frozen artifact hash guard. Existing
legacy golden draft and required-field rejection checks remain unchanged.

After approval: record a local-v1.2 revision and decision reference, update only
reviewed hashes, and run contract tests and consumer audit. Deploy compatible
producer and consumer together; do not send extended drafts to an older strict
consumer. Rollback both together, retaining saved evidence/drafts; extended saved
drafts require the compatible validator or explicit migration before reuse.

This proposal does not authorize deployment or change human-review behavior in
the existing legacy endpoint. The autonomous path remains separately validated.

## Verification at diagnosis

Contract suite: 11 pass, one frozen-schema hash failure. The real Python golden
draft, backend invalid-fact rejection, receipt validation, and existing calendar
checks pass. Typecheck, lint, and changed-file formatting pass.

The separate search integration fixture used 1–7 November 2026 deadlines. On
9 November, activeApplicationWhere excludes all seven, leaving the unknown-date
row (actual 1, expected 8). The fixture now uses ordered dates one year ahead;
production deadline filtering and all expected result assertions are unchanged.
A PostgreSQL rerun could not start because local initdb fails with
`could not look up effective user ID 501: user does not exist`, including outside
the sandbox. This is not a claim that the database integration test passed.

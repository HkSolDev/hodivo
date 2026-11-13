# Independent typing storage review

- Reviewed commit: `15b47e8267c2c3150b904be4373ca984f751aceb`
- Baseline: `a600ef65ed1cd194a7ad18b55a9fb3ac1b8d909f`
- Contract: `storage-draft-v1`; review limited to draft storage and import.

## Finding

### P2 — Single-line metadata accepts C1 control characters

**Confirmed.** The batch clarification requires plain single-line metadata to reject controls (`docs/AGENT_COORDINATION_2026-11-12-typing-storage-implementation.md:45`). `src/lib/typing-import-input.ts:62` rejects C0, DEL and unpaired surrogates, but not the C1 control range U+0080–U+009F. Consequently an exam name, label, title, shift or URL containing an embedded C1 control can be accepted and stored. For example, `exam.name = "a\u0085b"` passes `parseTypingImport`; U+0085 is NEXT LINE, so supposedly single-line metadata can contain a line-control character. The existing metadata acceptance test covers NUL, DEL, newline and surrogates, not C1 (`scripts/typing-storage-acceptance.test.ts:102`). This finding concerns metadata, not passage text, for which the contract explicitly permits characters outside its listed C0/DEL restrictions.

**Impact:** malformed metadata can enter operator previews and future displays despite the approved validation boundary. Reject the C1 range in metadata and extend the existing focused validation test; preserve the separate passage-text policy. No runtime change was made as part of this review.

## Verdict and checks

**Not accepted as fully contract-conformant:** the confirmed metadata validation gap requires coordinator disposition. Database acceptance remains **independently unverified** in this review; no disposable database URL was provided. This is not a claim that persistence tests failed.

- Confirmed the checkout HEAD equals the requested SHA and inspected its diff, import validation, canonicalization, equality/read-back, serializable transaction, schema, migration and focused tests.
- Ran Node 24 pure tests with `DATABASE_URL` and `TEST_DATABASE_URL` unset: 38 passed, 1 real-CLI/database test skipped, 0 failed. Independently reproduced the C1 acceptance using `parseTypingImport` without database access.
- No application environment, live database, migration execution, deployment, integration, or runtime/schema/test/contract edits were performed. The coordinator's earlier test results are reported context, not independently rerun database evidence.

## Follow-up verdict

Reviewed fix commit `5d46aaf1cd6d82778769914dd03d95dce60ccdb5` against `15b47e8267c2c3150b904be4373ca984f751aceb`. Its two-file delta rejects all C1 characters in single-line metadata through the shared validator and extends the existing metadata test to cover all 32 code points. The separate multiline/passage policy remains unchanged. The confirmed finding is resolved; **no remaining code-review blockers identified** for the reviewed scope.

The coordinator reports red-to-green verification and 38 passing pure tests for the fix; I inspected the delta but did not independently rerun those tests. Database acceptance remains independently unverified without a disposable database, and this verdict does not establish deployed or live behavior.

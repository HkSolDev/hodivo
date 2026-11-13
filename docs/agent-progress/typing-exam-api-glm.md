# GLM 5.3 Flash Free: bounded analysis handoff

Batch typing-exam-execution-20261113. Read-only reference-based response;
not repository inspection, implementation, official-source verification or an
approved contract. Manager supplied context directly; no file tools.

## Proposed public read contract (v1)

**Principles:** published-only egress; drafts/retired return the same `404` as nonexistent ids (no existence leak); pagination is cursor-only with a hard max (no offset, no "all" endpoints); passage text is only ever served one-version-at-a-time, never in listings; GET-only.

**Shared error shape** (all non-200s):

```json
{
  "error": {
    "code": "invalid_cursor | invalid_limit | not_found | no_published_passage",
    "message": "..."
  }
}
```

### 1. `GET /api/public/typing-exams?limit=&cursor=`

- `200` → `{ items: [{ id, slug, name, organization }], nextCursor: string | null }`
- Only exams with ≥1 published version. Ordered deterministically (e.g. `createdAt, id`). No versions/policies/text here.
- `limit`: non-numeric or `<1` → `400 invalid_limit`; `>50` → clamped to 50; default 20.
- `cursor`: malformed/tampered → `400 invalid_cursor` (never a crash or full dump).
- Empty result → `200 { items: [], nextCursor: null }` — not 404.

### 2. `GET /api/public/typing-exams/{examIdOrSlug}/versions`

- `200` → `{ exam: {id, slug, name, organization}, items: [{ id, label, language, runnable, unreadyReason? }] }`
- Published versions only, ordered by label. Unknown exam → `404 not_found` (identical body to a draft-exam id).
- `runnable` = published **and** `durationSeconds != null` **and** `backspacePolicy`/`editingPolicy`/`scoringMethod` in the supported enum **and** `thresholds` valid **and** ≥1 published passage.
- `unreadyReason` (single string, shown when `runnable=false`): `missing_duration | unsupported_backspace_policy | unsupported_editing_policy | unsupported_scoring_method | invalid_thresholds | no_published_passage`. Published-but-unready is still listed — it just can't start.

### 3. `GET /api/public/typing-exams/{examIdOrSlug}/versions/{versionId}`

- `200` → adds `durationSeconds`, `backspacePolicy`, `editingPolicy`, `scoringMethod`, `thresholds` (only when supported; otherwise `null` + `unreadyReason`).
- Draft/retired `versionId` → `404 not_found`, never `403`.
- Never contains passage text or any review notes/audit fields — response keys are a fixed whitelist.

### 4. `GET /api/public/typing-exams/{examIdOrSlug}/versions/{versionId}/passage`

- The "start a run" snapshot: `200` → `{ id, revision, contentHash, text, language }` — latest **published** revision only.
- Repeat calls are idempotent (same `revision`/`contentHash`) until a new revision publishes; the client pins `contentHash` for the run so a future result endpoint can verify it.
- Version published but no published passage → `404 no_published_passage`. Version not published → `404 not_found` (generic).
- No endpoint returns multiple passages; no query to pick arbitrary revisions.

**Non-goals enforced:** any non-GET method → `405`, no state change; unknown paths → `404`; result submission stays out of scope until the official scorer exists (it would be a separate, validated write endpoint keyed to `contentHash`).

## Focused tests (~15, contract-level)

**Exam list:** 1) only exams with ≥1 published version appear, stable order; 2) `limit=500` clamps to 50, `limit=abc`/`0` → 400; 3) tampered cursor → 400, valid last page → `nextCursor: null`; 4) empty catalogue → `200 []`.

**Version list:** 5) draft/retired versions absent; exam whose versions are all draft → 404; 6) draft exam id and nonexistent id return byte-identical 404 bodies; 7) parameterized: null `durationSeconds`, each unsupported policy, invalid `thresholds`, zero published passages → each yields `runnable:false` with the matching `unreadyReason`; 8) fully-specified published version → `runnable:true`, no reason field.

**Version detail:** 9) includes policies, asserts `text` key absent and no non-whitelisted keys (schema snapshot).

**Passage:** 10) returns latest published revision with stable `contentHash` across repeat calls; 11) only-draft passages → 404 `no_published_passage`; 12) draft version → generic 404 (same body as nonexistent); 13) text never appears in endpoints 1–3 (assert on serialized responses).

**Egress hardening:** 14) POST/PUT/DELETE on all four routes → 405 and DB state unchanged; 15) pagination walk over a 120-item fixture never returns more than 50 per page and terminates — no way to pull the full catalogue in one response.

## Manager review

Useful: bounded published projections, explicit readiness, no public writes.
Not accepted: invented route prefix/slug support, clamping invalid limits,
turning unsupported stored fields into null, claiming idempotent random reads,
passage response missing the coherent rule snapshot, and not enforcing readiness
on the passage route. No future result-submission endpoint is in scope.
No implementation authorization follows from this proposal.

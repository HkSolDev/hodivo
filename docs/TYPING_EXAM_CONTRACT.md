# Exam contract — coordinator draft

Status: **FROZEN exam-v1; initial simulation approved**.
Batch: typing-exam-execution-20261113.
Baseline inspected: `4ed4622`; 13 November 2026.
First target: SSC CHSL 2025 — LDC/JSA English, ordinary duration profile.
The descriptions below use proposal wording from drafting; this freeze adopts
the approved initial simulation and coordinator API choices, with no official scorer.
Shared types: `lib/typing/exam-contract.ts`. Concrete wire/error/input examples:
`tests/fixtures/typing-exam/start.json` and `cases.json`. Synthetic fixtures
are not content imports or official passages.

## 1. Scope and storage

Reuse `TypingExam -> TypingExamVersion -> TypingPassage`. Version owns rules;
passage owns exact text, revision, hash and provenance. The start response
combines them. No separate practice catalogue, attempt table, answer upload,
server submission, authentication requirement or new infrastructure.

Existing nullable version fields remain explicit nulls, never guessed defaults.
Importer currently requires null editingPolicy/scoringMethod. Proposed named
editor support needs a separately reviewed importer change and tests; schema
strings do not make arbitrary policies executable. No migration is needed for
the proposed initial projection. Practice contract remains unchanged.

## 2. Visual acceptance — required by Hemant

Reference directory:
`/Users/mrblackghost/Work/Practice/Keyboard_Typing_test/exam-mode/`.
Read `index.html`, `exam.css`, `exam.js` before UI implementation. Preserve the
candidate-style header, blue/neutral exam palette, timer, rule badges, font
controls, passage/input panels, counters, footer actions and submit dialog as
closely as possible on desktop. Do not restyle exam mode into the practice UI.
The reference is the supplied visual benchmark, not proof of official SSC UI.

Do not copy the sample person's name/roll number into the product as a real
candidate. Use neutral simulation labels; no additional personal data capture.
Do not copy hardcoded sample duration, error limits, scoring or shortcut bans.

Responsive adaptations must retain the same hierarchy and controls: wrap header
content, stack panels where needed, allow passage scrolling, keep input and
actions reachable with the on-screen keyboard. Scope styles to exam mode.
Verify 320/390/568/834/1440/1920 CSS-pixel widths, long passages, 200 percent
browser zoom, app font zoom, keyboard focus, touch and dialogs. No horizontal
page overflow or clipped controls. Preserve browser navigation and zoom;
never globally suppress Tab, function keys or browser shortcuts.
Use labelled dialogs with focus entry, containment and restoration. Countdown
updates must not announce every second to screen readers.

## 3. Proposed public read API

All listed endpoints are GET only, public, JSON, `Cache-Control: no-store` on
success and errors. No request includes typed text. Non-GET routes are 404.
Unknown query keys, repeated parameters and malformed identifiers return 400.
IDs: lowercase ASCII alphanumeric, length 1–64; identifiers are opaque DB IDs,
not exam slugs. No trimming/coercion. Clients reject missing/wrong-type fields
and unknown enum values; unknown JSON object keys are rejected for revision v1.

Pagination: optional decimal `limit` 1–50, default 20; optional `cursor` is the
last returned ID under this same parent/filter. Omitted cursor means first
page; empty or nonexistent/ineligible supplied cursor is 400. Compare IDs
exclusively (`id > cursor`) using the same database ordering. Sort ID ascending;
fetch at most limit+1 in SQL. Return at most limit items; nextCursor is the last
returned ID only when the extra eligible row exists, otherwise null. No clamping or offset
catalogue download. Stable pagination assumes records are not deleted or
republished during browsing; it is not a transaction across multiple requests.

| Endpoint | 200 body | Visibility |
| --- | --- | --- |
| `/api/typing/exams` | `{exams: ExamSummary[], nextCursor: string|null}` | Exams with at least one published English version |
| `/api/typing/exams/:examId/versions` | `{versions: VersionSummary[], nextCursor: string|null}` | Published English versions of that visible exam |
| `/api/typing/exam-versions/:versionId` | `{version: VersionDetail}` | Published English version with matching visible parent |
| `/api/typing/exam-versions/:versionId/passage` | `{snapshot: StartSnapshot}` | Only a ready version and eligible published passage |

Limit/cursor apply only to the two list routes. Detail/start accept no query.
Visible exam with no matching list entries returns an empty list; missing or
invisible parent is 404. No passage text in lists or version detail.

Exact proposed object keys (all required):

- `ExamSummary`: `id`, `slug`, `name` (strings), `organization` (string|null).
- `VersionSummary`: `id`, `examId`, `versionKey`, `label`, `language` (strings),
  `examYear` (integer|null). Language is `en` for v1.
- `VersionDetail`: all VersionSummary fields plus `rules`, `readiness`,
  `rulesUpdatedAt` (version updatedAt serialized as UTC ISO timestamp).
- `rules`: `durationSeconds`, `targetWpm`, `targetKeystrokes` (integer|null);
  `maxErrorPercent` (finite number|null); `backspacePolicy` (stored enum|null);
  `editingPolicy`, `scoringMethod`, `instructions`, `ruleSourceUrl`,
  `ruleSourceNote` (string|null). Preserve unsupported stored strings for
  inspection; never replace them with null. Render text escaped, not HTML.
  editingPolicy/scoringMethod are nullable strings, not closed wire enums;
  unsupported strings remain renderable but non-startable. backspacePolicy's
  closed wire domain is UNRESTRICTED/DISABLED/CURRENT_WORD_ONLY/null. sourceKind
  is OFFICIAL_PREVIOUS_YEAR/RECONSTRUCTED/PRACTICE. A future unknown DB enum is a
  server projection failure (503), never a client-side guessed interpretation.
- `readiness`: `{canStart: boolean, reasons: Reason[], scoringAvailable: boolean}`.
- `StartSnapshot`: `contractRevision` (literal `exam-v1`), `version`
  (VersionDetail), `passage` with `id`, `title`, `text`, `contentHash`
  (strings), `revision` (positive integer), `sourceKind` (stored enum),
  `sourceUrl`, `sourceNote` (string|null). Show sourceKind honestly: reconstructed
  and practice passages must not appear as official previous-year text.

Numeric bounds reuse importer limits: duration 1–3600 seconds (initial SSC
profile exactly 600), year 1900–2100, targetWpm 1–1000, targetKeystrokes
1–100000, maxErrorPercent 0–100. Null remains distinct from zero. Source URLs
are evidence links, not browser-fetched executable data. Unknown stored enum
or malformed numeric configuration blocks Start rather than being coerced.

Proposed errors: `{error:{code:string,message:string,reasons?:Reason[]}}`;
`reasons` exists only for 409. Codes: 400 `INVALID_REQUEST`, 404 `NOT_FOUND`,
409 `EXAM_NOT_READY`, 503 `SERVICE_UNAVAILABLE`. Messages are fixed public copy,
never raw exceptions, SQL, paths or record metadata. DB failures are 503, not
an empty catalogue. Define these optional-error-key rules in runtime validators.

## 4. Readiness proposal and unresolved scoring decision

Publication alone does not authorize Start. Required checks: reviewed/published
version and passage; positive supported duration; known supported editor and
backspace combination; nonempty compatible canonical text; valid provenance
metadata for any official-content claim. No silently repaired text or fallback
to another version. Start selects one eligible passage in the DB, then binds
version rules and passage revision/hash in one consistent read transaction.
Select randomly among eligible published passages in the selected version,
using the existing practice DB-selection approach. A repeat is allowed. Restart
uses the already loaded passage; it does not call this random read again.
Official provenance requires non-null reviewedAt/publishedAt, sourceUrl and
sourceNote identifying the edition and evidence; metadata alone does not prove
rights or authenticity, which remain part of human content review. Empty,
noncanonical, unsupported-character or provenance-incomplete passages are
ineligible. No eligible row maps to NO_ELIGIBLE_PASSAGE.
After loading, the browser holds this snapshot unchanged for the local session.
rulesUpdatedAt identifies the observed version state, not an immutable audit
revision; the actual copied rule values are authoritative for that local run.
No live revalidation or durable rules history is promised by this version.
No durable server attempt or guarantee across reloads is claimed.

Proposed stable reasons, sorted in this order, unique:
`RULES_INCOMPLETE`, `RULES_UNSUPPORTED`, `SCORING_UNAVAILABLE`,
`NO_ELIGIBLE_PASSAGE`. Only expose them for otherwise public content.

| Situation | Proposed result |
| --- | --- |
| Missing, draft or retired version | 404; never expose rules/text |
| Public but missing/unsupported required editor or duration | detail canStart=false; passage 409 |
| Public with no eligible published passage | detail canStart=false; passage 409 |
| Complete editor/timer, null scorer | canStart=true; scoringAvailable=false; no official result |
| Complete supported configuration and eligible passage | canStart=true; passage 200 |
| Database failure | 503; retry available |

Hemant approved option A on 13 November 2026: permit a clearly labelled exam simulation with confirmed
timer/editor rules while `scoringAvailable=false`. Show no SSC marks, error
percentage, qualification or substituted practice score. Scorer null is then
an explicit supported unavailable state, not a default formula.
The approval includes 10 minutes, normal corrections, first accepted insertion
timing, paste/drop blocked and the clock continuing through confirmation.
It does not approve guessed official scoring. Non-null unimplemented scorer
identifiers remain unsupported and block Start. For this initial profile,
null scorer is an explicit supported unavailable state; it is not a reason
in the blocking reasons array. `canStart` is true exactly when reasons is empty.

## 5. Initial domain profile — proposals awaiting freeze

Evidence is recorded in `TYPING_EXAM_RULE_MATRIX.md`; official evidence is
distinct from the following web simulation choices. Confirmed ordinary profile
duration is 600 seconds; correction permitted; no required passage repetition.
Do not copy DEO or compensatory-profile settings into this profile.

Proposed code-owned editor identifier stored in editingPolicy:
`native-correction-v1`, paired only with
UNRESTRICTED initially. Other combinations remain unsupported. Allow caret,
selection replacement, Backspace, Delete and undo/redo. Proposed simulation
choice: prevent paste/drop insertion inside the answer field, preserve normal
browser shortcuts elsewhere. Preserve LF/TAB; provide a labelled insert-tab
button without trapping keyboard Tab navigation. Do not implement speculative
word-lock rules in v1.

Proposed lifecycle matches the original's intent: instructions -> ready;
first accepted nonempty text insertion starts the monotonic 600-second deadline;
navigation, deletion on empty text and rejected paste do not start it. IME
preedit does not start the clock until committed insertion. No pause in exam.
Timer display uses ceil(max(0, deadline-now)/1000). Enforce expiry before every
accepted edit, confirmation and timer update. Expired text is not accepted.
Finishing passage does not end the session; allow corrections until expiry.
Submit confirmation runs the clock, Cancel preserves text, and confirm/expiry
produce exactly one finished state. Disable submit before timer starts.
Finished answer is read-only. Restart requires confirmation and resets the same
snapshot; choosing another version discards the local session only after warning.
Reload has no promised resume. Never persist typed text or send it over network.

## 6. Required acceptance examples before writers start

Freeze serialized fixtures and independent checks for: bounded empty/list pages;
bad cursor/ID/unknown query; direct draft/retired IDs; null and unsupported rules;
no published passage; DB failure; exact LF/TAB/spaces and hash; cross-version
binding; consistent rule/text revision; first insertion and IME start; expiry
during edits/dialog; duplicate confirm; same-passage restart; stale fetch ignored;
practice regressions; no typed-text requests; responsive visual comparisons.

## 7. Stage completion gate and next assignment

Freeze addendum, 13 November: DeepSeek reviewed the complete draft; coordinator
resolved findings in the linked progress report. Hemant approved simulation A.
Importer change is coordinator-owned: accept editingPolicy null or exactly
native-correction-v1; scoringMethod remains null-only. Legacy drafts unchanged.
No schema change, live import or official scoring is included.

Deterministic readiness mapping: missing required duration/backspace/editor,
targetWpm, ruleSourceUrl/ruleSourceNote, or review/publication timestamp adds
RULES_INCOMPLETE. Non-null but unsupported editor/backspace, duration other
than 600, targetWpm other than 35 or malformed bounded numeric values adds
RULES_UNSUPPORTED. Non-null scoringMethod adds SCORING_UNAVAILABLE. No eligible
passage adds NO_ELIGIBLE_PASSAGE. Reasons are unique in the listed order.
scoringAvailable is always false for exam-v1. Optional null instructions,
maxErrorPercent and targetKeystrokes do not block. Rules never get defaults.
Compatible passage text is ASCII printable plus LF/TAB, length 1–50000,
with a non-whitespace printable character; verify its SHA-256 against exact
text before producing a start snapshot. Reject mismatch as ineligible.
Metadata review remains human-owned. No future exam is implicitly supported.

Local domain exports, frozen for UI integration:
`createExamSession(snapshot): ExamSession`,
`advanceExamSession(session, now): ExamSession`,
`finishExamSession(session, now): ExamSession`,
`resetExamSession(session): ExamSession` from `exam-session.ts`;
`applyExamInput(session, text, inputType, now, isComposing=false): ExamSession`
from `exam-input.ts`. now is finite monotonic milliseconds. All functions are
pure. Unsupported snapshots throw before creating a session. Rejected edits
retain text but still advance expiry. Composing events do not commit text;
UI keeps preedit separately, and commits composition once on completion.
insertFromPaste/insertFromDrop/insertFromYank/insertReplacementText are blocked;
ordinary insertion, linebreak, deletion, undo/redo and committed composition
are allowed. Unknown input types are rejected. No timeout pause on blur.
First accepted nonempty insertion sets deadline = now + 600000. Reset retains
snapshot and restores ready/empty/600 seconds. Session text limit is 50000
UTF-16 units, an explicit simulator safety bound, not an SSC requirement.

UI client exports: loadExams(signal, cursor?), loadExamVersions(examId, signal,
cursor?), loadExamVersion(versionId, signal), loadExamSnapshot(versionId, signal).
The first two return ExamPage<T> after validating HTTP list wrappers; the other
two return their unwrapped version/snapshot. Never silently discard unknown keys.
Module paths are `lib/typing/exam-api.ts` and existing shared types. API errors
may have a typed client error with code/reasons; never expose raw response text.

Backend exports registerTypingExamRoutes(app, optionalCatalogue) in its owned
route file; coordinator alone registers it in src/app.ts. The injected
catalogue seam and its types are backend-owned, not a frontend boundary.

Next reviewer prompt (read-only):

> Review this draft against the actual schema/importer, source matrix and user
> requirement to preserve the original exam appearance responsively. Identify
> contradictions, missing response fields and readiness ambiguities. Do not
> invent scoring, upload typed text, edit contracts, or claim browser checks.
> Return concrete corrections and distinguish pending decisions from defects.

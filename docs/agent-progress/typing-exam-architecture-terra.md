# Typing exam architecture review

Date: 13 November 2026  
Batch: `typing-exam-plan-20261113`  
Role: independent architecture/integration reviewer  
Scope: read-only inspection of the plan, the protected practice integration
worktree at `/private/tmp/aptus-typing-pr-20261112` (`d33f555`), and the
original `Keyboard_Typing_test/exam-mode` source. No application, schema,
practice, source-project, environment, database, Git, network, or deployment
state was changed.

## Verdict

The proposed direction is viable **only after a new exam contract freezes the
missing start/readiness/scoring meanings**. The existing catalogue is a sound
draft-storage base, not evidence that a selected published version is runnable
or that its result is official. Keep the practice slice isolated and do not
start any exam implementation lane until the contract resolves the decisions
below.

## Evidence inspected

- The plan correctly says the API/UI are not implemented and defers exact
  semantics to a frozen contract (`docs/TYPING_EXAM_IMPLEMENTATION_PLAN.md:7-8,
65-76`).
- The current schema owns rules on `TypingExamVersion`, passages under that
  version, and gives version/passage independent draft/published/retired states
  (`prisma/schema.prisma:328-407`). The importer rejects unknown fields and
  allows only `null` for `editingPolicy` and `scoringMethod`
  (`src/lib/typing-import-input.ts:25-37, 268-310`).
- The importer conflicts rather than mutating any existing natural-key record;
  this is the useful immutability primitive for source content
  (`src/lib/typing-import.ts:38-108`).
- Current practice intentionally reads any published compatible passage and
  ignores version rules (`src/lib/typing-catalogue.ts:7-27`; the DB test names
  that behavior). It must remain a separate endpoint and cannot be reused as
  exam start logic.
- The supplied HTML is a visual/reference behavior source, not official-rule
  evidence. It starts on `keydown`, uses interval-based expiry, tracks a
  word buffer rather than selection/caret state, and labels its generic
  threshold outcome official (`exam-mode/exam.js:219-240, 262-347, 392-444`).
  The plan already flags those limitations (`docs/TYPING_EXAM_IMPLEMENTATION_PLAN.md:37-50`).

## Blocking contract decisions

1. **Define the complete runnable tuple and readiness truth table.**
   `PUBLISHED` currently means content visibility, not runtime support. Before
   a passage endpoint can return 200, specify exactly which version fields must
   be non-null, which identifier combinations are implemented, and whether
   `targetWpm`/`maxErrorPercent` are required for a qualification result. A
   `CURRENT_WORD_ONLY` value exists in storage but has no exact deletion
   definition. Unknown, null, unsupported, or evidence-missing inputs must
   produce a named unavailable reason and never silently select a fallback.

2. **Choose the public response for unavailable content.**
   Identity privacy/visibility and readiness are different: a draft/retired or
   non-public parent should be a uniform 404; a public selected version that is
   incomplete needs one frozen response (for example 409/422 with a finite
   public reason code, or a 200 detail with `ready: false` while the passage
   endpoint refuses start). Do not leak draft names, rule sources, passages, or
   arbitrary database error text. The plan currently lists alternatives but
   does not choose one (`docs/TYPING_EXAM_IMPLEMENTATION_PLAN.md:91-103`).

3. **Freeze passage selection and revision binding.**
   The schema permits several passage revisions and several published passages
   per version. A start response must identify the exact `passageId`,
   `contentKey`, `revision`, canonical-text hash, and version identity that its
   snapshot used. Define whether selection is client-chosen, server-random, or
   deterministic; validate requested IDs belong to the selected public version.
   Lists must not return passage text. A version detail/list must not imply that
   every passage is eligible just because one is published.

4. **Make a browser-session snapshot explicit, including reload/reset.**
   A fetched configuration must be copied into the session before typing and
   never re-read/mutated on selection changes, refetches, or publication edits.
   Since v1 has no server attempt, this only prevents in-page drift; it does not
   establish integrity across reloads, multiple tabs, or developer tools. Reset
   must create a new local session from a fresh, validated start response, not
   alter a running snapshot. This limitation must be visible in product copy.

5. **Define editing through input intents, not keydown.**
   For every policy, specify allowed/disallowed outcomes for `insertText`,
   `insertFromPaste`, drop, `insertReplacementText`, composition, Backspace,
   Delete, selection replacement, caret movement, undo/redo, and mobile input.
   `CURRENT_WORD_ONLY` needs exact word-boundary rules for space/tab/newline,
   selected ranges, Delete versus Backspace, and an incorrect current word.
   The reference only guards Backspace and therefore cannot supply this rule
   (`exam-mode/exam.js:284-337`). Browser-wide shortcut/Tab suppression must not
   be copied; it breaks keyboard navigation without making a client simulation
   secure.

6. **Freeze timer transitions and the denominator.**
   State needs one pure transition table: idle -> running only on accepted
   input; running -> expired based on a monotonic deadline checked at every
   edit, submit, and tick; expiry wins races with submit; finished rejects all
   later edits. The clock continues unfocused/backgrounded. Decide whether a
   manual submit before first input is allowed and how its elapsed time/score is
   represented. The reference interval is rendering only, not the authority to
   accept a late edit.

7. **Do not reuse practice score semantics as exam scoring.**
   Practice counts insertion attempts (including corrected mistakes) and uses
   its own WPM penalty formula (`lib/typing/session.ts:139-162`,
   `lib/typing/scoring.ts:1-38`). The reference repeats the same log-based
   approach, then calls it qualified (`exam-mode/exam.js:392-444`). Until a
   source-backed scoring identifier and worked examples are approved, render
   factual typed/final-text counts only and label speed/qualification
   unavailable—not zero, pass, fail, or official. Freeze: character unit
   (code point versus code unit), insertions/deletions/substitutions, corrected
   errors, zero input, elapsed versus configured duration, truncation/overflow,
   rounding, and thresholds.

## API boundary requirements for the frozen contract

- Strictly parse `limit`/`cursor`; choose a stable order with a unique
  tie-breaker, maximum limit, opaque cursor format, malformed/unknown query
  rejection, and a no-text list projection. The current practice route is a
  useful precedent for rejecting unexpected query keys and returning sanitized
  503s (`src/routes/typing-practice.ts:10-28`), not a catalogue implementation.
- Detail must project only public parent/version fields. Passage must join and
  filter both `TypingExamVersion.status = PUBLISHED` and
  `TypingPassage.status = PUBLISHED`, enforce the chosen readiness tuple, and
  be `no-store`. Do not expose `reviewedAt`, source notes, or unpublished
  provenance without an explicit product decision.
- Exact contract fixtures must cover: unknown query, malformed cursor, limit 0,
  limit above maximum, missing ID, guessed draft/retired child, published child
  under non-public parent (if an exam publication state is introduced), empty
  public version, null/unsupported rule, mixed published/draft passages,
  passage from another version, database failure, and stale selection response.
- Do not add an exam write endpoint, broad passage download, client-posted
  result/typed text, or a live migration/publication command in this batch.

## Non-overlapping ownership check

The plan's intended boundaries are appropriate: backend owns only the new
catalogue route/helper/tests; domain owns pure exam session/input/tests; UI
owns isolated exam components/API client; coordinator owns the contract,
schema/import evolution, `src/app.ts`, shared fixtures, navigation, and
integration checks. The one conflict to prevent is a UI agent encoding rule
meaning/readiness locally while the backend independently invents it. Give both
the same frozen fixture set and make the pure domain functions consume the
start-response snapshot rather than Prisma-shaped records.

## Acceptance cases required before implementation is called complete

1. A public list/detail never includes draft/retired identity or passage text;
   every list page is bounded, stable, and cursor-safe.
2. Only a public, fully supported version with an eligible public passage can
   start; every other state has the frozen response and disabled UI state.
3. The returned snapshot binds one passage revision/hash and all rules; changing
   UI selection, a late response, or a catalogue refetch cannot alter it.
4. Each editing-policy fixture drives the same pure input function for physical
   keyboard, selection, beforeinput, paste/drop, undo/redo, IME, and touch.
5. Timer expiry is deterministic under delayed ticks/backgrounding, manual
   submit races, and zero input; no post-expiry edit changes counts.
6. Source-grounded scoring fixtures prove the chosen formula; without them the
   UI explicitly withholds official score/qualification. Practice regression
   fixtures remain unchanged.
7. A disposable database proves visibility/read projections and parent-child
   filters; pure/API/browser checks run against the exact integrated commit.

## Status

`blocked on contract`, not an implementation failure. The only approved frozen
typing contract found is `storage-draft-v1`; it explicitly excludes publication
and public read API semantics (`docs/TYPING_STORAGE_CONTRACT_PROPOSAL.md:130-139`).
No implementation approval follows from this review.

## Addendum: official-first source provenance and scoring

Reported research findings reinforce the per-version boundary: RRB CEN 05/2024
CBTST material describes a 10-minute task, no editing tools, and retyping after
completion; SSC CHSL sources differ by year and describe 35 WPM/10 minutes and
word-error treatment; CPCT material instead describes final-text word counts,
corrections excluded from KSC, and a 15-minute assessment. These are not one
shared "government typing" algorithm. Treat each as a candidate rule bundle
until the coordinator records the exact primary document URL, document date,
page/section, extracted rule, and reviewer verification in the frozen contract.
Third-party mock behavior is comparison-only and cannot fill a missing official
field.

Recommendation:

1. Publish only an evidence-complete **exam/version**. Its frozen rule bundle
   must name the authority, exam/year/shift/language, primary-source locator,
   duration, input/edit policy, passage provenance, score unit/formula,
   correction treatment, rounding, and qualification threshold. A generic
   label such as `OFFICIAL` or one source URL without the covered fields is
   insufficient.
2. Use code-owned, version-specific scoring identifiers—not free-form database
   strings and not the practice scorer. An identifier is enabled only with
   source-grounded fixtures proving its worked examples. Null means no official
   calculation or qualification. The present importer correctly permits only
   null scoring/editing identifiers; the coordinator must approve a contract
   revision before allowing any value.
3. Keep the existing `ruleSourceUrl`/`ruleSourceNote` as the storage seed, but
   do not overload it into field-level proof. For the first release, select one
   version whose official evidence supports the entire bundle and preserve the
   excerpts/page references in protected contract fixtures. Design a separate,
   reviewable evidence model only when multiple primary documents are needed.
4. Copy only the interaction that the selected primary source actually proves.
   For example, RRB's no-editing rule must not automatically become CHSL/CPCT
   behavior, and CPCT's final-text/KSC treatment must not be presented as SSC
   scoring. If the supplied passage lacks official provenance, offer a clearly
   labelled simulation without official qualification.

## Addendum: staged execution review

`docs/TYPING_EXAM_TEAM_EXECUTION.md` accurately presents S0--S7 as **prepared
assignments**, not launched implementation: S0 is still pending, S1 has no
accepted specialist report, S2 is queued behind the evidence/contract gates,
S3/S4 have not started, and S5 is additionally blocked by AGY command
permission. The future worktrees, SHA, and contract revision are explicitly
deferred to dispatch, so no completion, test, or commit is fabricated.

One sequencing correction is needed before dispatch: the arrow places S6 after
S5B, but S6 itself says its disposable content/API proof starts after S2 with
integrated S3/S4. Make that explicit as `S3/S4 -> S6` in parallel with S5B
(with S6 still requiring an evidence-complete version); otherwise the diagram
unnecessarily blocks the first producer-to-DB-to-HTTP fixture proof on UI
integration. No other new overlap blocker was found: S2 owns shared semantics
and fixtures, S3/S4 own disjoint implementation paths, S5A is a fixture-only
shell, and S5B waits for both handoffs.

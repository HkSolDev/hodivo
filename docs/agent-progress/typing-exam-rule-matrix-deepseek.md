# DeepSeek V4.1 Flash Free: bounded analysis handoff

Batch typing-exam-execution-20261113. Read-only reference-based response;
not repository inspection, implementation, official-source verification or an
approved contract. Manager supplied context directly; no file tools.

## Scope separation

### Confirmed official facts
- Exam: SSC CHSL 2025, LDC/JSA, English medium.
- Test duration: 600 seconds.
- Speed target: 35 WPM.
- Current-cycle official editing and evaluation rules: **not yet confirmed**; do not encode as expected behavior.

### App implementation decisions (not official claims)
- `TypingExamVersion` policy fields may be null; null means “not specified,” never an inferred default.
- Policy IDs are resolved by code-owned registries, not executable database formulas.
- Import accepts null `editor` and `scorer` only.
- A passage references a version; an attempt is evaluated against that pinned version/passage.
- Practice mode ignores all exam rules and still records attempt scoring.
- Unsupported or unresolved configuration is non-executable; no values are guessed.

### Unknowns
- Official backspace/edit allowance.
- Official error counting, scoring method, and maximum error percentage.
- Whether 35 WPM is qualifying-only or contributes to scoring.
- Official treatment of paste, undo/redo, IME/composition, selection replacement.
- Official keystroke/evaluation environment behavior.

Legend: **O** = confirmed official, **A** = app decision, **U** = official behavior unresolved; assert only the app invariant.

---

## 1. Beforeinput / input editing

| ID | Precondition | Action | Expected result | Basis |
|---|---|---|---|---|
| BI-01 | Exam version resolves to a supported editing policy | Type valid characters | Accepted text changes per code-owned policy; final text remains the scoring source | A |
| BI-02 | Supported backspace policy ID | Backspace mid-text / at start / on empty text | Behavior matches resolved code policy; no crash, no negative-length state; official allow/deny not asserted | A/U |
| BI-03 | Editing policy rejects an edit | `beforeinput` is canceled | Displayed text and stored final text remain unchanged; no phantom scoring input | A |
| BI-04 | Browser emits `input` without usable `beforeinput` | Insert/replace text | Final text and scored text stay identical; no duplicate application | A |
| BI-05 | IME/composition input | Commit composed text | Composition is not double-counted; committed final text is consistent | A |
| BI-06 | Paste, drop, undo, redo attempted | Perform action | Allowed or blocked strictly by resolved policy; cannot bypass editing policy | A/U |
| BI-07 | Selection replacement or deletion | Replace/delete selected range | Resolved policy applies; final text remains internally consistent | A/U |
| BI-08 | Deadline arrives during rapid typing | Continue keystrokes across deadline | Pre-deadline edits accepted; post-deadline edits rejected; no lost/duplicated accepted characters | A |
| BI-09 | Exam already finalized | Attempt any edit | Edit rejected; finalized text unchanged | A |

---

## 2. Timer deadline

| ID | Precondition | Action | Expected result | Basis |
|---|---|---|---|---|
| T-01 | SSC CHSL LDC/JSA English exam started | Start timer | Countdown begins at 600 seconds | O |
| T-02 | Timer reaches 00:00 | Attempt further input | Editing locks; attempt finalizes once | A |
| T-03 | Input event and deadline occur together | Type at deadline boundary | Deterministic single outcome; no double finalization | A |
| T-04 | Tab hidden/backgrounded or clock changes | Wait past deadline | Authoritative deadline still ends the exam; no extension | A |
| T-05 | Timer callback repeats or page reloads | Re-trigger finalization | Exactly one attempt/score record; idempotent | A |
| T-06 | Reload at or after deadline | Reopen attempt | No resumed editing; finalized state preserved | A |
| T-07 | Practice mode active | Reach 600 seconds | Exam duration rule is not applied; practice remains governed by practice behavior, not exam fields | A |

---

## 3. No input

| ID | Precondition | Action | Expected result | Basis |
|---|---|---|---|---|
| NI-01 | Exam started | Submit no keystrokes; reach deadline | Attempt recorded with empty final text; scoring handles empty input without crashing | A |
| NI-02 | Editing policy rejects keystrokes | Type only disallowed input | Final text remains empty; no phantom characters | A |
| NI-03 | No input; scorer is null/unsupported | Reach deadline | Attempt and empty final text are retained; score is explicitly unsupported, not fabricated | A |
| NI-04 | No input or whitespace-only input | Finalize | Scorer receives the exact final text; any whitespace handling remains unresolved and is not asserted | U |

---

## 4. Final text scoring

| ID | Precondition | Action | Expected result | Basis |
|---|---|---|---|---|
| FS-01 | Attempt finalized | Score attempt | Scoring uses final accepted text plus the pinned version’s passage; not keystroke history | A |
| FS-02 | Edits made before deadline | Finalize | Final text includes accepted edits; rejected/post-deadline edits excluded | A |
| FS-03 | Same final text, passage, and resolved scorer | Score repeatedly | Scoring output is deterministic | A |
| FS-04 | Scorer is null | Finalize | Scoring unsupported; no numeric score produced | A |
| FS-05 | Scorer throws or times out | Finalize | Safe failure; final text retained; no partial or invented score | A |
| FS-06 | Supported scoring method ID | Finalize | Code-owned scorer executes; no database formula is evaluated | A |
| FS-07 | Practice attempt | Finalize | Exam eligibility rules ignored; attempt scoring still recorded | A |
| FS-08 | Passage/version mismatch or passage changed | Score attempt | Evaluation is unsupported; do not score against a different passage | A |

---

## 5. Unsupported configuration

| ID | Precondition | Action | Expected result | Basis |
|---|---|---|---|---|
| UC-01 | `editingPolicy` null or unknown ID | Start exam | Exam is unsupported/non-executable; no editing rule is inferred | A |
| UC-02 | `backspacePolicy` null or unknown ID | Start exam | Exam is unsupported/non-executable; no backspace rule is inferred | A |
| UC-03 | `scoringMethod` null or unknown ID | Start/finalize exam | Exam/scoring is unsupported; no formula is guessed | A |
| UC-04 | `durationSeconds` null | Start exam vs practice | Exam unsupported; practice may proceed without applying an exam duration | A |
| UC-05 | `targetWpm` null | Start exam | No speed qualification is inferred; exam eligibility output unsupported | A |
| UC-06 | `maxErrorPercent` null | Start exam | No error cap is inferred; dependent exam evaluation unsupported | A |
| UC-07 | Imported version has null `editor`/`scorer` | Import, then start exam | Import accepted; exam attempt is unsupported at runtime | A |
| UC-08 | Mixed null and present policy fields | Start exam | Exam is unsupported; no per-field defaults are inserted | A |
| UC-09 | Invalid values, e.g. non-positive duration/target or out-of-range percentage | Start exam | Configuration rejected/unsupported; values are not clamped or guessed | A |
| UC-10 | Passage references a missing/unregistered version | Start attempt | Attempt unsupported; no substitute version is selected | A |
| UC-11 | Policy ID exists but is not registered in code | Start exam | Fail as unsupported; no permissive fallback | A |

---

## 6. Practice-specific invariants

| ID | Precondition | Action | Expected result | Basis |
|---|---|---|---|---|
| P-01 | Practice mode | Type with null/unsupported exam policies | Practice proceeds; exam rules are ignored; attempt scoring remains available per scorer | A |
| P-02 | Practice mode; exam timer fields null | Run past 600 seconds | No exam-deadline rule applied | A |
| P-03 | Practice mode; scorer available | Finalize | Attempt score recorded; no exam qualification decision inferred | A |
| P-04 | Practice mode; scorer null | Finalize | Attempt retained; score explicitly unsupported | A |

---

## Do not assert without official confirmation
- Backspace allowed/prohibited count or location.
- Error definition, full/half error treatment, or maximum error percentage.
- Whether 35 WPM is qualifying-only.
- Paste/undo/IME official allowance.
- Any official minimum qualification outcome for SSC CHSL 2025 LDC/JSA English.


## Manager review

Useful: deadline enforcement on every edit/submit and input-intent bypass cases.
Final-text scoring remains conditional on the confirmed evaluator, not a generic
assertion. Practice attempt scoring is local only; no server attempt recording.
This response tests supplied assumptions, not independent official rule evidence.

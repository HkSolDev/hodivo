# Exam rules research and implementation decisions

Checked: 13 November 2026. This is a source/evidence record, not a migration,
publication, runtime implementation or claim of official certification.

## Source priority

Use the exact recruiting authority's notification, corrigenda, candidate
instructions and evaluation guide for the selected cycle/post/language first.
Use commercial typing sites for interface comparison and explicitly labelled
fallback simulations only when official detail cannot be located. A fallback
must not silently become an official rule. Record conflicts per rule, not just
one trusted/untrusted flag for the entire exam.

## Findings

### SSC CHSL: distinguish typing from DEO skill tests

The [CHSL 2025 notice](https://ssc.gov.in/api/attachment/uploads/masterData/NoticeBoards/Notice_of_adv_chsl_2025.pdf),
section 13.8.13.7, specifies English 35 WPM and Hindi 30 WPM; the ordinary typing
period is 10 minutes. Compensatory timing and DEO schemes are separate; do not
hardcode one duration/threshold for all candidates/posts.

An [official CHSL 2020 candidate notice](https://ssc.nic.in/SSCFileServer/PortalManagement/UploadedFiles/Skill_test_for_Combined_Higher_Secondary_Exam_2020_23052022.pdf)
explicitly permits arrow/Backspace corrections. This confirms that cycle, not
an automatic guarantee for every later edition.

[SSC typing/DEST evaluation guide](https://www.ssc.nic.in/Downloads/portal/english/evaluation-dest-tt.pdf)
classifies omissions, additions, substitutions, spelling, repetitions and
incomplete words as full mistakes, and spacing, capitalisation, punctuation,
transposition and paragraph issues as half mistakes. Therefore the current
character-attempt penalty is not an SSC-equivalent evaluator. Numeric error
cutoffs must come from the applicable result/notice, not generic 5% defaults.
Do not substitute the separate stenography evaluation guide.

Access: CHSL notice was fetched directly. Older candidate notice and evaluation
guide were available as indexed official text; direct evaluation PDF fetch
failed. Preserve that distinction before implementation fixtures are approved.

### RRB NTPC: correction restrictions and a distinct penalty

[Graduate CEN 05/2024 instructions, 22 December 2025](https://www.rrbcdg.gov.in/uploads/2024/05-NTPCG/052024-CBTST_Instructions.pdf)
describe a 1-minute warm-up, 30-second break and 10-minute assessed test. They
require a full passage, allow starting the passage again after completion, and
prohibit editing tools. Evaluation uses weighted mistakes, a 5% allowance and
10-word penalty per final mistake. The worked example is 400 words, 10 final
mistakes, 10 minutes -> 30 WPM. This differs from subtracting incorrect
characters per minute. Exact rounding and handling of an allowance exceeding
mistakes remain to verify; do not invent a negative-error bonus or clamp.

[UG CEN 06/2024 instructions, 6 February 2026](https://www.rrbcdg.gov.in/uploads/2024/06-NTPCUG/062024NTPCUG-CBTST_Instructions.pdf)
independently give the 10-word penalty example and prohibit editing tools.
Do not conflate these two recruitment versions in the database.

Access: official indexed text located; direct graduate PDF fetch returned 502.
The extracted fraction layout is ambiguous; visually inspect the full document
before encoding the full/half-mistake calculation. Interpreting no-editing as
DISABLED Backspace plus an append-only editing policy is our implementation
mapping; test Delete/selection/undo too rather than treating it as a quoted
browser-specific rule.

### CPCT: word-based measures, not the existing attempt log

[Official CPCT assessment document](https://www.cpct.mp.gov.in/per/g01/pub/1172/ASM/WebPortal/1/Hindi/PDF/CPCT_Assessment_Formula.PDF)
defines correct/incorrect submitted words, net words as correct words and
accuracy as correct words divided by typed words. Erased characters in
unrestricted mode and Backspace presses do not contribute to keystroke count.
It describes completion submission and timed auto-submission. Thus counting
all corrected insertion attempts is unsuitable for this assessment.

[Official CPCT syllabus](https://www.cpct.mp.gov.in/per/g01/pub/1172/ASM/WebPortal/1/Hindi/PDF/CPCTSyllabus.pdf)
specifies 15 minutes for each English/Hindi typing section. Do not copy a
commercial 10-minute mock as the official duration.

Access: indexed official text obtained, direct assessment PDF returned 403.
Full default editing policy, complete formula/layout and current qualification
bands still need the complete applicable documents; secondary sites disagree.

### UPSSSC Junior Assistant and generic High Court preset

No adequate official cycle-specific full editing/scoring instructions were
located in this bounded search. A mirrored Junior Assistant notification is
not accepted as a verified official rule record. The supplied
[CGLTyping page](https://cgltyping.in/upsssc/junior-assistant-typing/) explicitly
describes its test as ungraded practice. It cannot establish a qualification
method. A generic High Court preset is also insufficient: identify the court,
post and recruitment edition before assuming CURRENT_WORD_ONLY.

## Commercial reference comparison

- [Typing Baba English test](https://www.typingbaba.com/test/online-typing-test-in-english.php):
  general five-character gross WPM with an error-adjusted net measure. Useful
  for general practice; not evidence for every exam's error unit or cutoff.
- [CGLTyping CHSL](https://cgltyping.in/ssc-chsl-typing-test/): correction UI and
  10-minute simulation, with its own warning that limits are not cycle-specific.
- [CGLTyping RRB](https://cgltyping.in/rrb-ntpc-typing-test/): Backspace defaults
  on. This conflicts with the official no-editing requirement; reject this
  setting for our RRB exam simulation.
- [CGLTyping CPCT](https://cgltyping.in/cpct-typing-test/): 10-minute practice
  counter and shared scoring engine. Do not use those as CPCT's official setup.

These pages were read as documents; their interactive browser behavior was not
tested. Do not claim their JavaScript implements everything their text states.

## Professional data and API design

The user's desired flow is retained:

operator imports draft version rules + passage text -> reviewed publication ->
API returns one coherent passage/rules snapshot -> exam client applies policies
and dispatches to the supported evaluator -> local result for that attempt.

Keep rules once on TypingExamVersion. Every passage references that version.
Do not duplicate rule objects per passage or infer the exam from passage title.
API may combine both records in one response without denormalising the database.

The start response must bind versionId, passageId/revision/hash, exact text,
durationSeconds, backspacePolicy, editingPolicy, scoringMethod and the exact
applicable thresholds/instructions. Missing required fields or unsupported
identifiers mean not ready; public drafts/retired records stay inaccessible.
A browser snapshot prevents in-page configuration drift, not tampering or an
exam-authority-certified result. Keep typed text local in this release.

Separate code-owned policy identifiers from stored numeric parameters. Proposed
methods SSC_TYPING_WEIGHTED_V1, RRB_CBTST_2024_V1 and CPCT_WORDS_V1 are names for
future implementations, NOT currently supported or approved schema enum values.
No arbitrary formula/evaluable script goes into the database. Each evaluator
needs source-backed examples, alignment/error classification and boundary tests.

Existing fields cover identity, evidence URLs/notes, duration, Backspace and
nullable scorer/editor. Timer start, passage-repeat/completion, submission,
formatting and warm-up/break semantics need a reviewed contract; add explicit
fields or a precisely defined policy identifier only when the first supported
exam needs them. Existing importer permits null scorer/editor only. Any expanded
values require a separate reviewed validator/import-contract change.

Use per-rule provenance in the operator review record now: official URL,
cycle/date/page, rule covered, direct/indexed/secondary access and unresolved
items. Do not expand the database solely for a speculative provenance system.
A secondary fallback may run only as clearly labelled practice simulation; it
must not produce an official pass/fail claim.

## Implementation order and concrete acceptance

1. Finish the protected practice slice; do not change its scoring or rules.
2. First support a precisely named English exam version. RRB provides a useful
   penalty example, but full document and error categories must be checked
   before official-equivalent scoring is enabled.
3. Freeze API and input/lifecycle policies; keep unknown versions non-startable.
4. Extend importer/scorer identifiers only for the confirmed version. No live
   migration, publication or DB writes are authorized by this research.
5. Backend catalogue, pure domain and UI lanes implement the same fixtures.
6. Verify correction via keyboard/mobile/selection/Delete/undo; background
   expiry; zero input; repeat passage; full/half mistakes; allowance and rounding;
   corrected text versus insertion attempts; and official worked examples.
7. Review the exact combined commit. Practice still ignores all exam policies.

This narrows the previous plan's unknowns; it does not declare every exam's
configuration frozen or re-use a universal formula for unsupported exams.

# Typing exam rule matrix — independent S1 review

Date: 13 November 2026  
Batch: `typing-exam-execution-20261113`  
Role: independent evidence review; no runtime, schema, importer, contract, or
catalogue change.

## Scope acknowledgement

This is a bounded input to the coordinator's rule matrix, not an accepted
matrix or implementation approval. It reads the existing research and
architecture review and checks supplied primary links where accessible. A
source that could not be fetched in this review remains unverified even when
the existing research records indexed text for it.

## Evidence status for an English first version

| Candidate version | Directly verified primary facts | Still required before official runnable version |
| --- | --- | --- |
| **SSC CHSL 2025, LDC/JSA, English** | The [2025 SSC notice](https://ssc.gov.in/api/attachment/uploads/masterData/NoticeBoards/Notice_of_adv_chsl_2025.pdf), pp. 18–19, directly states English 35 WPM, accuracy of typing on a given passage, 10 minutes, and a 15-minute compensatory case. It says evaluation follows separate Commission guidelines and errors are calculated to two decimal places. | The applicable evaluation-guide revision must be directly obtained and tied to this cycle; capture its complete error classification, weighting, denominator, corrected-error treatment, rounding and qualification threshold. Obtain this cycle's candidate instructions for timer start, editing/caret/selection/undo/paste behavior, completion/repeat, auto-submit, and passage/source rules. Do not carry the 2020 correction permission forward without that proof. |
| **RRB NTPC Graduate CEN 05/2024, English CBTST** | Existing research records official indexed text for warm-up, break, 10-minute assessment, no editing tools, repeat after completion, weighted mistakes, 5% allowance, 10-word penalty and one worked result. The primary PDF at the recorded RRB URL returned 502 in this review. | Directly inspect and archive the primary PDF/page locations. Resolve the visual formula/weighted full-versus-half-mistake layout, allowance edge cases, rounding, timer transition after warm-up/break, exact no-edit scope, completion/repeat behavior, and qualification rule. No scorer or browser mapping is ready until those facts are extracted. |
| **CPCT English typing** | Existing research records official indexed text for final-text word measures and a 15-minute English/Hindi section. The recorded CPCT formula and syllabus PDFs returned 403/400 respectively in this review. | Obtain the applicable primary documents by an authorized access path and record exact edition/page. Verify full editing policy, formula and rounding, timer start/auto-submit, passage rules, completion behavior, qualification bands, and whether the document applies to the selected English test configuration. |

## Recommendation: smallest non-guessed scope

There is **no evidence-complete official English version yet**. Therefore do
not publish or mark an `OFFICIAL` scorer runnable in S2.

The narrowest sensible target is **SSC CHSL 2025 LDC/JSA English training
simulation**, because its current-cycle primary notice is directly available
and establishes the candidate-visible duration, language, target speed, and
accuracy context. It may run only after the contract labels it a simulation and
keeps qualification/official score unavailable until the current-cycle
evaluation and interaction rules above are evidenced. It must not infer that
editing is unrestricted merely because an older CHSL notice permitted
correction.

If S2 requires a version to have an implemented official evaluator before it
can start at all, leave every official version unready and choose no first
version yet. RRB is the next most promising evidence candidate, not a shortcut:
the inaccessible primary document and unresolved weighted-error formula make
it unsuitable for first implementation today.

## Contract inputs still needed

For the selected exact cycle/post/language, the coordinator needs one
field-level evidence bundle containing:

1. Authority, document title/date, stable URL, page/section, direct-access
   status, and reviewer for each asserted rule.
2. Exact timer timeline: start event, duration, warm-up/break, manual submit,
   auto-submit, zero-input handling, and repeat/completion.
3. Input policy covering Backspace, Delete, selection replacement, caret
   movement, undo/redo, paste/drop, composition and mobile input—or an
   explicit statement that the authority leaves a behavior unspecified.
4. Score definition: source/final/attempt text basis; word or character unit;
   alignment/error classes; corrected errors; allowance; rounding; zero input;
   threshold; and at least one official worked example.
5. Passage provenance/rights and the exact passage revision to bind in the
   start snapshot.

Until this bundle exists, null/unsupported editing and scoring methods must
remain unavailable rather than acquiring a default. The already verified CHSL
notice is sufficient for a displayed training target, not for an official
pass/fail result.

## Verification record

- Directly opened: SSC CHSL 2025 official notice; relevant text located on pp.
  18–19.
- Attempted but unavailable here: SSC CHSL 2020 candidate notice (timeout),
  RRB CEN 05/2024 CBTST instructions (502), CPCT syllabus (400), CPCT formula
  (403). These failures do not disprove the documents; they prevent direct
  verification in this review.

## Addendum: SSC CHSL 2025 correction and evaluation evidence

Hemant selected **SSC CHSL 2025 LDC/JSA English** as the first runnable
profile. That selection can support a runnable training flow; it does not by
itself convert the local browser result into an SSC result.

### What the primary SSC documents establish

- CHSL 2025 §13.8.13.3 says the Skill Test/Typing Test is evaluated under the
  Commission's evaluation guidelines available on its website; §13.8.13.4 says
  errors are calculated to two decimal places. The same notice fixes the
  English LDC/JSA target at 35 WPM and the ordinary duration at 10 minutes.
- The SSC's [20 June 2022 revised evaluation notice](https://ssc.nic.in/SSCFileServer/PortalManagement/UploadedFiles/Important_Notice_latest_news_20062022.pdf)
  says its revised English/Hindi Typing Test/DEST guidelines were implemented
  immediately. Its attached candidate instructions say a candidate need not
  repeat a completed passage and **may revise and correct mistakes during the
  prescribed time**. The guide also enumerates full and half mistake classes.
- The separate [CHSL 2020 candidate notice](https://ssc.nic.in/SSCFileServer/PortalManagement/UploadedFiles/Skill_test_for_Combined_Higher_Secondary_Exam_2020_23052022.pdf)
  expressly allows arrow and Backspace keys in its stated overrun/wrong-word
  situation. It is useful historical confirmation of a correction-capable
  CHSL interface, but is not the authority for an unqualified 2025 rule.

### Contract implication

Set the selected profile's **candidate-visible editing policy** to correction
allowed during the prescribed time, supported by the 2025 notice's reference
to SSC guidelines plus the live official guideline. Model ordinary browser
editing with accessible native input behavior; SSC does not need to enumerate
`beforeinput`, IME, paste, touch, Delete, or undo/redo for the product to make
an ordinary editable control. Those are implementation choices, provided they
do not claim a stricter official restriction. Do not copy the 2020
word-limit/arrow-Backspace condition as a 2025 constraint.

The selected profile is still **not ready for an official qualification
outcome**. The material found does not state the CHSL-2025 pass/error cutoff,
the exact denominator for the two-decimal error percentage, or an executable
alignment/rounding procedure for all final-text edge cases. It can display
source-backed final-text mistake categories and a training result, but must
withhold SSC pass/fail until the coordinator captures an applicable cutoff and
the remaining scoring semantics in the frozen evidence bundle.

Before S2 freezes the profile, retain the 2025 notice and the current fetched
2022 guideline as versioned evidence (URL, retrieval date, relevant pages, and
hash/excerpt). The 2025 notice's generic reference makes the guide strongly
relevant, but it does not name a revision; this record is what prevents a
later replaced guideline from silently changing the implemented profile.

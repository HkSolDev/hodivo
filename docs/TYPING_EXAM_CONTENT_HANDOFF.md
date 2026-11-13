# Initial simulation content handoff

Prepared input: `content/typing/ssc-chsl-2025-english.draft.json`.
The ordinary English simulation uses the already-approved exam-v1 rules.
Evidence and browser choices are separated in `TYPING_EXAM_RULE_MATRIX.md` and
`TYPING_EXAM_CONTRACT.md`. Official scoring, category cutoff evaluation and
qualification are unavailable; null scoringMethod is intentional.

The passage is exact text from the user-supplied HTML project's
`exam-mode/passages.js`, entry `ssc-chsl-2023-s2`. That entry's official/2023
attribution is unverified. The import labels it PRACTICE, sets passage examYear
and shift to null, and records provenance. It must not appear as an official
previous-year passage. SHA256:
`8c92ca19ce963ea79edf9f65707d4f4b53be8b82d6c76f4bba289b211866f4e9`.

The importer validates the file and computes canonical text hash/counts. Preview
is the default. The isolated database test verifies preview writes nothing,
apply stores DRAFT records, and public catalogue APIs exclude those records.
No real catalogue has been imported or published by this work.

Before a later authorized publication:

1. Review the exact input, text hash and provenance. Obtain a verified source
   before changing sourceKind or attaching official exam year/shift claims.
2. Reconfirm the version's rule evidence and browser simulation label. Do not
   fill unknown scoring/limits from a commercial typing site or old HTML.
3. Preview against the explicitly selected target database using the existing
   import tool. Resolve conflicts by reviewed new version/revision identities.
4. After separate release authorization, apply the import as DRAFT. Re-read the
   stored version and passage bytes; record the review time and IDs.
5. Publish only the reviewed version and passages with explicit reviewedAt and
   publishedAt timestamps through a controlled, authorized database operation.
   The importer deliberately cannot accept public status/timestamps from JSON.
6. Verify actual API readiness and loaded snapshot/text hash, then run a browser
   session against that target. Record source revision, content IDs and results.

There is no new publication/admin UI or automated publication workflow in scope.

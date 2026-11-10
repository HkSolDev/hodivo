# Gemini search compatibility verification — 10 November 2026

## Confirmed cause

The deployed `services/ai/providers/gemini.py` sends Google Search and
`responseMimeType=application/json` together. A live `gemini-2.5-flash` request
returned HTTP 400: `Tool use with a response mime type: 'application/json' is unsupported`.
The same model with Google Search but without JSON generation settings returned
HTTP 200 with an answer and five grounding sources. The existing worker already
uses the `v1beta` REST endpoint; installing the SDK or changing API version alone
is not the fix.

Risk: likelihood 10/10 for this request/model combination, impact 8/10 because
repair discovery cannot complete; score 80. This is a confirmed compatibility bug,
not evidence that the tested key is invalid or that search itself is unavailable.

Google distinguishes the model (`gemini-2.5-flash`) from the API version
(`v1beta`). Both are selected in the request URL. Combining structured output
with built-in tools is documented for Gemini 3 series; our live 2.5 request
confirmed the restriction relevant to this worker.

## Minimal implementation under verification

Isolated branch: `fix/gemini-grounded-search-json`, worktree
`/private/tmp/aptus-gemini-grounded-search`, based on merged main `7da3f24`.
Production has not been changed by this verification.

1. Reuse the existing Gemini transport/key-pool loop in a private request helper.
   Preserve the existing `request_json` behavior for extraction, review and vision.
2. `discover_sources` first makes a Google Search request without JSON MIME mode
   or a response schema. Keep the answer and original `groundingMetadata`.
3. If search fails, returns empty text, or lacks grounding sources, stop without
   a second paid call. Report unresolved; never substitute model knowledge.
4. Make a second request with the actual recovery JSON schema and no search tool,
   carrying the original request and grounded evidence. Treat evidence as data,
   preserve numeric values and prohibit invented quotations or source URLs.
5. Return structured candidates plus original grounding metadata, combined attempt
   count and separate usage for both calls. Preserve existing bounded 429 key
   rotation and failure behavior; do not silently repeat an uncertain paid call.
6. Keep existing independent source capture, issuer/notice identity, post binding,
   exact quotation and downstream validation/publication checks. A structured
   response or Google citation alone is not sufficient publication evidence.

The same configured search model is used for both calls. No new model setting,
dependency, SDK migration, or general autonomous tool loop is needed. A separate
DeepSeek auxiliary adapter experiment is paused and not deployed.

## Checks completed

- Four new behavioral tests failed against the original search implementation.
- Proposed implementation passed all 485 Python tests. Existing tests continue
  covering key order/rotation, non-quota failures, review and vision behavior.
- New checks cover search without JSON settings, schema-only second call,
  grounding and numeric-value preservation, empty/ungrounded responses, failures
  at either stage, and bounded key rotation in both calls.
- Live isolated server test used the deployed image's dependencies and credentials,
  an experimental provider mounted read-only, and the real `GeminiRepairSearch`
  schema. Search and structuring succeeded in two calls with two candidates and
  one grounding source. The independently fetched first source failed capture;
  no recovered fact was accepted or published by this test.
- A diagnostic follow-up again passed both API calls and returned two numeric
  candidates. The first source was on `ssc.gov.in` and independent capture
  returned HTTP 200, but the proposed quotation was absent from captured text.
  This confirms that API compatibility alone does not establish usable evidence.
- No production ENV change, worker replacement, database write or publication
  was performed. Unit success and provider compatibility are distinct from
  end-to-end recovery acceptance.

## Remaining implementation requirement

The live quotation check did not pass. The production recovery design should be:
Google Search discovery → independently capture the selected official document →
structured generation from captured text → existing identity/post/quotation checks.
Keep capture orchestration in the repair client/pipeline, reusing
`OfficialRepairCapture`, rather than teaching the provider to scrape websites.
The provider transport split remains useful, but structuring only a grounded
summary is insufficient for reliable verbatim recovery. Do not weaken quote
validation to accept paraphrases. Verify at least one real official-document
candidate through the existing full validator before activation; retain negative
cases for missing quotes, wrong identity and third-party sources.

## Activation after verification

Deploy the tested provider change through the standalone-worker procedure in
the standalone-worker deployment runbook, then set `SEARCH_PROVIDER=gemini`
and `SEARCH_MODEL=gemini-2.5-flash` in its private runtime configuration and
recreate the container safely. Merely changing the model in the current image
would still trigger the confirmed HTTP 400. Preserve extraction/review/vision
configuration and scheduler state unless a separate change is requested.

## Official references

- [Tools and structured-output compatibility](https://ai.google.dev/gemini-api/docs/tools?authuser=19)
- [Google Search grounding and citation metadata](https://ai.google.dev/gemini-api/docs/generate-content/google-search?hl=en)
- [GenerateContent API and grounding fields](https://ai.google.dev/api/generate-content?hl=en)

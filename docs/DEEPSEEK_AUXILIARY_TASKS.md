# DeepSeek auxiliary tasks — 12 November 2026

## Scope

Branch `codex/deepseek-auxiliary-tasks` starts from merged main `8f2e6cc`.
Add DeepSeek as an auxiliary provider using its Responses API. Existing extraction,
capture, identity verification, schema validation, retirement, retry, and publication
rules are unchanged. No contracts or database migration change.

```dotenv
LLM_PROVIDER=deepseek
LLM_MODEL=deepseek-flash
SEARCH_PROVIDER=deepseek
SEARCH_MODEL=deepseek-v4-pro
REVIEW_PROVIDER=deepseek
REVIEW_MODEL=deepseek-flash
VISION_PROVIDER=deepseek
VISION_MODEL=deepseek-flash
DEEPSEEK_OFF_PEAK_ONLY=false
# Preserve DEEPSEEK_API_KEY privately; never commit its value.
```

Search requires Pro because Flash ignores Responses web_search. Vision requires
Flash. These capability mismatches fail at provider resolution instead of silently
claiming research or interpreting a text answer as image understanding.

References checked against current official documentation:

- https://api-docs.deepseek.com/guides/responses_api/
- https://api-docs.deepseek.com/api/create-response/

## Implementation and checks

`providers/deepseek.py` translates the existing task interface to Responses input
parts and structured output. It preserves URL annotations, tool usage and token
usage. Research is unresolved unless completed tool activity or successful search
usage is returned. Model answers remain leads, not source evidence: existing
capture and official identity checks still apply.

Each task HTTP call uses provider_post, retaining shared request metrics and durable
per-notice attempt limits. A request has an 8192 output-token cap and reasoning
none. This is not a monetary cap: a native search can issue multiple queries,
and max_tool_calls is not supported by DeepSeek. No new silent provider fallback.

Assessment returns proposed read_requests as JSON; these become read_notice requests
for the existing URL/field/budget validator. No provider executes arbitrary local
reads or bypasses the known-URL policy.

Confirmed live checks in an isolated container using the server's existing private
ENV file, without a worker-volume mount or ingestion:

- Flash structured review: evidence 'One vacancy' -> JSON answer 'One'.
- Pro research: completed web_search_call, tool_search=1, answer https://ssc.gov.in/.
  The first search response was rejected as deepseek_response_invalid; a repeat
  passed. The first raw response was not retained, so its exact shape is unknown.
  The successful response had no URL annotations; no citations were fabricated.
- Flash image input: synthetic red PNG -> JSON answer 'red'. This is not OCR proof.

Offline: 541 worker tests passed, including five focused task-adapter tests.
Typecheck and lint passed. Prettier has no parser for Python or ENV files; those
files are checked with the Python suite and diff checks instead.

## Release status and remaining risks

This document records implementation and isolated tests, not scheduled-worker
rollout. The server worker still uses the previously deployed Gemini task settings.
Merge and build this branch, then replace the standalone worker under the scheduler
lock, updating only the listed task settings and preserving keys, data and timing.
Keep a rollback container. Check the first real run's saved reports independently.

The inspected UPESSC draft also lacks verified official source evidence and has
ambiguous Balika qualifications. A provider switch does not resolve those gates
by itself. No real job was published by the smoke checks.

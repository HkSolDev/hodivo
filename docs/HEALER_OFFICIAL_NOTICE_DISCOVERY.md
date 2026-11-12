# Official-notice recovery from portal discoveries

## Confirmed failure

The 12 November worker run reached repair for AP Mahesh Bank CCO and ASRB
Technical Assistant notices discovered through MySarkariNaukri, and UPESSC
Principal 08/2026 discovered through Sarkari Result. Their repair reports returned
`enrichment_requires_verified_identity` with zero research requests because the
parsed bundle issuer was absent. Changing the research provider could not fix
that pre-search gate. Likelihood 9/10, impact 8/10, risk 72: confirmed on these
saved production drafts, not an inferred provider outage.

## Change

`review_and_repair` now starts one official-notice discovery round for a recruitment
candidate with incomplete identity or third-party evidence. Organisation and job
names are search hints, not verified identity. An advertisement number is optional
for discovery. The prompt requests the latest matching cycle and dated amendments,
never a different recruitment just because it is newer.

The worker independently captures at most three candidate URLs using the existing
public-destination protections. Only operator-configured issuer hosts or reserved
Indian government, academic, research and banking domains are candidates. A
redirect to another hostname is withheld. Matching requires captured organisation,
all discovered post names, cycle, and a known date or non-placeholder advertisement.
A contradictory advertisement, conflicting parsed identity, or multiple matching
sources remains unresolved rather than being selected arbitrarily.

One uniquely matched, readable official notice is prepared through the existing
evidence gate and freshly extracted through the configured extraction provider.
The fresh official candidate replaces portal-derived facts for subsequent review;
search prose is never merged as evidence. The original portal URLs remain in the
saved repair report and draft metadata, including across subsequent repair retries. The captured official hostname is available to subsequent
field-level healing. Repaired source identity is saved with the candidate and restored
on pending-repair retries, avoiding repeated discovery of an already verified notice.
Existing validation, review, retirement, durable provider
budgets and publication gates remain in force.

Failed discovery, unreadable sources and failed extraction preserve the previous
candidate. This does not promise that every field can be found or every draft will
publish. Different post spellings, unknown cycles, multiple matching revisions and
custom official domains outside configured/reserved hosts can still require review.
In particular, multiple matching revisions are not automatically merged by this fix.

## Verification

Offline regression tests cover missing advertisement/issuer, captured official
replacement, wrong cycles/posts/issuers, third-party results, redirects, conflicting
advertisements, multiple matching revisions, search/extraction failure, missing
cycle, prompt requirements, capture normalization and the real review/repair call
path. No schema, database, frontend or deployment settings change.

Full offline Python suite: 555 tests passed. Live-provider accuracy and production
publication require a separate post-deployment run; neither is claimed here.

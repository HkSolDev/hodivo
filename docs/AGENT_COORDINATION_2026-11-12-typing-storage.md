# Typing storage/API: contract preparation batch

Batch: `typing-storage-design-20261112`, draft revision 1. Status: both design handoffs reviewed; proposed contract awaits approval. No implementation contract frozen.

## Baseline and scope

Coordinator inspected branch `codex/typing-practice-plan`, HEAD `d930a69e0093a440ef5ad99c92a6ab19326cec17`, plus current dirty source. No remote fetch. Practice is locally implemented; storage/API remains planned. Original staged, unstaged and untracked work is preserved. Isolated documentation snapshots are not Git worktrees or clean release baselines and are not authorized for implementation.

Input-file SHA-256 manifest: `/private/tmp/typing-storage-baseline.json`. Both agents receive the same selected source/doc bytes. No environment files, credentials, database data or writable shared dependencies were copied.

## Assignments

| Agent | Model | Isolated directory | Sole writable deliverable |
| --- | --- | --- | --- |
| GLM | `opencode/glm-5.3-flash-free` | `/private/tmp/aptus-typing-storage-glm` | `docs/agent-progress/typing-storage-glm-proposal.md` |
| DeepSeek | `opencode/deepseek-v4.1-flash-free` | `/private/tmp/aptus-typing-storage-deepseek` | `docs/agent-progress/typing-storage-deepseek-audit.md` |

GLM proposes exact catalogue/import/API boundaries. DeepSeek independently audits the plan and actual existing route/storage patterns. Coordinator compares both and records remaining decisions before implementation. Their recommendations are proposals, not frozen product semantics.

## Protected boundaries and acceptance

No source, Prisma schema/migrations, existing contract/lock, dependencies, CI, practice UI, worker or infrastructure edits. No database/provider calls, deployment or official-content publication. Agents must acknowledge baseline and scope before editing. Only illustrative draft examples are allowed; unknown exam rules remain unknown.

Review must cover exact text/hash/count conventions, explicit nullability, identity and revision constraints, draft visibility, immutable publication, atomic/idempotent imports, strict bounded queries, minimal public projections and generic failure responses. Reports must explain why, list affected paths and proposed behavioral checks, and separate blockers from optional improvements.

## Next gate

Review both reports, reconcile contradictions against the plan, and prepare a concrete contract for Hemant's review. The coordination protocol requires approval for new shared semantics; this batch does not treat silence as approval. Implementation will use separate branches/worktrees and a frozen baseline after that gate. No migration is applied in this batch.

## Completed handoff and coordinator review

Both OpenCode processes exited 0, using only the assigned free models. Sessions:
GLM `ses_e306fb778ffeombml7hiKvUDZd`; DeepSeek `ses_e306fb450ffeie7SeYTZKYk1UG`.
Their reports were copied unchanged into docs/agent-progress. Coordinator verified
all original input hashes unchanged and no unexpected agent edits. No runtime,
lint, typecheck or DB test was run for this documentation-only batch.

[Concrete coordinator proposal](TYPING_STORAGE_CONTRACT_PROPOSAL.md) resolves
conflicting import/counting/concurrency recommendations and narrows the first
implementation sub-slice to draft storage/import. Public API contract and first
source-backed publication remain subsequent gates. Agent assertions are advisory;
manager corrections in that proposal take precedence only after approval.

Original plan status updated to show this preparation, without claiming database
implementation. Only docs were changed; staged work and practice were untouched.

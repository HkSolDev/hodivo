# Server deployment and operations

Latest frontend/API release: [typing & AI agent readiness deployment, 17 November 2026](TYPING_DEPLOYMENT_2026-11-17.md).
Frontend and API run merged revision `e8098ad793980e1c94dad77bd1a7e4de3e660b9f` (PR #52)
through Coolify (API digest `sha256:52744bd8b8b93719fb3eebe155eeaff151839bbb3e3d9f87b51b0bd5783deb17`). See that
record for deployed changes; earlier release notes ([13 November 2026](TYPING_DEPLOYMENT_2026-11-13.md))
and image snapshots below are historical.

Verified against the server on 10 November 2026. This is the entry point for
current deployment topology; dated release notes retain historical results.
Recheck live state before changing a service. No credentials belong in this file.

## Ownership and traffic

| Component            | Managed by                          | Identity and connection                                                                       |
| -------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------- |
| Frontend             | Coolify Docker-image application    | Resource `yjkbdsihlnbpy1xnauk2890e`, container port 3000                                      |
| API                  | Coolify Docker-image application    | Resource `pzvqgrcr4r2ruzfxi6mqjq2b`, private alias `aptus-api`, port 8080                     |
| Worker               | Host user's cron and Python wrapper | Standalone container `aptus-worker-cron`, no HTTP route or published port                     |
| Registry             | Standalone Docker service           | `aptus-registry`, `127.0.0.1:5000`, volume `aptus-registry-data`                              |
| Ingress              | Coolify proxy / Traefik             | `coolify-proxy`; public HTTP/HTTPS listeners                                                  |
| Application database | Neon PostgreSQL                     | API runtime `DATABASE_URL`; not the stopped local audit/restore PostgreSQL containers         |
| Review validator     | Standalone Docker container         | `aptus-review-validator`, on `coolify`; inspected running, endpoint behavior not audited here |

Public frontend hosts are `hodivo.app`, `www.hodivo.app`, and
`aptus.novaraorigin.com`. Traefik routes them to frontend port 3000.
Frontend server requests and worker ingestion reach `http://aptus-api:8080`
through the private Docker network `coolify`. The API persists application data
in Neon. Worker artifacts persist separately in `aptus-worker-data:/work`.

**A network named `coolify` does not establish management ownership.** The worker
has no Coolify management labels and is started by host cron. It retains some
historical `COOLIFY_*` environment names; those are not evidence that Coolify
controls it. Do not start an old worker resource in Coolify alongside host cron.

## Host and files

SSH alias `akash9568` selects the configured server; account `mrblackghost`,
architecture `x86_64`, system timezone `Asia/Kolkata`.

```sh
ssh -o UseKeychain=yes -o IdentitiesOnly=yes -o BatchMode=yes \
  -i ~/.ssh/id_ed25519_akash9568 akash9568
```

| Path                                                   | Purpose                                                               |
| ------------------------------------------------------ | --------------------------------------------------------------------- |
| `/home/mrblackghost/aptus-releases/`                   | Clean source snapshots and image-build logs                           |
| `/home/mrblackghost/aptus-worker.env`                  | Private worker runtime settings; mode 0600                            |
| `/home/mrblackghost/aptus-random-worker.py`            | Host scheduling wrapper; outside the image                            |
| `/home/mrblackghost/aptus-worker-random-schedule.json` | Persisted next run and selected delay                                 |
| `/home/mrblackghost/aptus-worker-run.lock`             | Non-overlap and deployment lock                                       |
| `/var/lib/docker/volumes/aptus-worker-data/_data`      | Host backing directory for worker `/work`; preserve via Docker volume |
| `/data/coolify/proxy`                                  | Proxy configuration mount; change routes through Coolify              |

Existing backup locations are not proof of a current recoverable backup. Before
migration or destructive maintenance, verify an appropriate backup and restore
procedure. Database restore, DNS/TLS upstream ownership and host disaster recovery
were not audited in this pass.

## Verified image snapshot

| Service  | Source revision / image tag                | Registry digest                                                           |
| -------- | ------------------------------------------ | ------------------------------------------------------------------------- |
| Frontend | `2ac98685c9e5d23eecb58687379f66e9be4cbfe8` | `sha256:def5ba31e991af691a076c6c473a40ef333bef843c4910caf3b119365bccb1c6` |
| API      | `3f25b40dde522da0571557c75b8d2c58ac726458` | `sha256:c30eb24080ac30aafd8ed3c37a128c6fadc0683cbc28cfd2d1d1ce4afc8ec0e9` |
| Worker   | `d49189c7504e5577541c822dc5c5eb91ebf3f30c` | `sha256:fa5d760457388d38925a82137fa0595a5432c98a4cb10a9f1fc34d4e216cbe79` |

Image names are `localhost:5000/aptus-frontend:REVISION`,
`localhost:5000/aptus-api:REVISION`, and `localhost:5000/aptus-worker:REVISION`.
These services can legitimately run different revisions. Never infer deployment
from a merge, image tag alone, or a healthy status.

## Where configuration lives

- Frontend/API: their respective Coolify application runtime settings. Frontend
  `BACKEND_INTERNAL_URL=http://aptus-api:8080` must match the Docker build argument
  used for its Next rewrite. API owns `DATABASE_URL`, auth/OAuth settings,
  `INGEST_TOKEN`, `FRONTEND_REVALIDATE_URL`, and review-operator configuration.
  Frontend also currently receives `INGEST_TOKEN`; preserve required settings.
- Worker: private host ENV file and the environment supplied at container
  creation. It uses `BASE_URL=http://aptus-api:8080`, the matching ingestion token,
  and DeepSeek/Gemini task settings documented in [the worker guide](WORKER_DEPLOYMENT_2026-11-10.md).
- Keys, tokens, database URLs and OAuth secrets must never be printed in an
  inventory or committed. Use selected names and presence checks.
- Editing an ENV file or running `docker restart` does not change a container's
  environment. Recreate the affected container through its actual manager.

## Deploy a change

1. Select an exact merged source SHA with passing relevant CI. Export clean
   tracked source; do not copy a dirty checkout or private ENV into build inputs.
2. Build only the affected image from `deployment/frontend.Dockerfile`,
   `deployment/api.Dockerfile`, or `deployment/worker.Dockerfile`. Add OCI label
   `org.opencontainers.image.revision=REVISION`, use an immutable revision tag,
   and push to `localhost:5000`. Retain previous images.
3. For frontend/API, update the image tag and deploy through the selected Coolify
   application. Preserve environment, domains, private alias and network.
   Do not replace these containers manually behind Coolify's back.
4. For the worker, hold the host scheduler lock and confirm it is not running.
   Preserve the old container for rollback; recreate `aptus-worker-cron` with
   the new image, private environment, `coolify` network, `aptus-worker-data:/work`,
   non-root user, restart policy `no`, and scheduler command `--once`.
   Inspect and preserve any additional existing limits/settings before recreation.
5. Check source SHA → OCI revision → registry digest → selected container image.
   For frontend also verify ingress; for API verify `/health` and a database-backed
   request. For the worker, use `--help` without network for import/startup checks;
   starting its normal entrypoint can incur provider calls and database writes.
6. Check the actual run report and logs separately. A live provider smoke request
   proves only that tested request; healthy status and exit code zero do not
   establish successful extraction, review or publication.

A minimal rebuild template, run from the selected clean release directory:

```sh
# Set REVISION to the full selected Git SHA; choose one affected service.
SERVICE=worker
docker build --label "org.opencontainers.image.revision=$REVISION" \
  -f "deployment/$SERVICE.Dockerfile" \
  -t "localhost:5000/aptus-$SERVICE:$REVISION" .
docker push "localhost:5000/aptus-$SERVICE:$REVISION"
```

For frontend include build argument `BACKEND_INTERNAL_URL=http://aptus-api:8080`.
Migrations are separate operator actions; service startup must not implicitly
apply a migration. A container rollback does not roll back database changes.

## Worker schedule and checks

Host crontab contains:

```cron
* * * * * /usr/bin/systemd-cat -t aptus-worker-cron /usr/bin/python3 /home/mrblackghost/aptus-random-worker.py # aptus-worker-random
```

The wrapper checks once per minute, prevents overlap and chooses a random
60–300 minute gap after each run. The current extraction provider is DeepSeek, with `DEEPSEEK_OFF_PEAK_ONLY=false`;
the peak-hour restriction therefore does not apply. Read the persisted state for the next
run rather than copying a historical timestamp.

```sh
crontab -l
docker inspect aptus-worker-cron --format '{{.Config.Image}} {{.State.Status}} {{.State.StartedAt}} {{.State.FinishedAt}} {{.State.ExitCode}}'
journalctl -t aptus-worker-cron --since '24 hours ago' --no-pager
```

Avoid unrestricted `docker inspect` output: the full object contains secrets.
Treat logs as private operational material as well. The new worker's first
observed scheduled lifecycle started 10 November at 18:48:01 IST and finished
19:44:55 IST with exit code zero. Processing/publication outcomes were not audited
in this documentation pass. See the worker guide for verification limits and
rollback container identity.

## Worker replacement — 12 November 2026

Replaced the stopped standalone `aptus-worker-cron` under its scheduler lock
with `localhost:5000/aptus-worker:8f2e6cc1ef4ffb64dcfd4aff7aa43a2f689d9345`.
OCI revision and container image ID verified against the built image; registry
digest: `sha256:6fb9f1acf329cecd0116f46afafeb915f5067a2c2b6a87d75abe8297568b9a24`.
Preserved exact container environment, non-root user, `--once` command, restart
policy, `coolify` network and `aptus-worker-data:/work` mount. Scheduler and its
persisted timing were not edited. Previous container retained as
`aptus-worker-before-html-first-8f2e6cc`.

New container observed in `created` state, awaiting host scheduler. Offline
network-disabled `--help` startup passed before replacement. No forced paid run,
live provider verification or publication check performed. API/frontend remain
on their previous images; database migration has not been applied in this release.
This replacement alone does not verify end-to-end compatibility or publication.

## DeepSeek worker replacement — 12 November 2026

Deployed merged main `87a405a3a768bfcee327578035ec895a030c351b` to
`aptus-worker-cron` under the scheduler lock after confirming it was stopped.
Image OCI revision and container image ID matched; registry digest:
`sha256:0b9b9cb5ab410207eea9bd640664b5cde6b387fbe9335d1bfefd5d3056888499`.

Extraction/review/vision now use DeepSeek `deepseek-flash`; internet research
uses DeepSeek `deepseek-v4-pro`. `DEEPSEEK_OFF_PEAK_ONLY=false` remains set.
Updated only these nonsecret provider settings in the private host ENV and
container. Credentials, non-root user, command, restart policy, network and
`aptus-worker-data:/work` preserved. Host schedule unchanged. Rollback container:
`aptus-worker-before-deepseek-87a405a`.

Image build, push and network-disabled `--help` passed. Container observed created,
awaiting scheduled run; no forced processing or publication verification performed.
Official-source identity and validation gates remain enforced. Frontend/API untouched.

Manual run authorized and confirmed running on 12 November 2026 at
07:57:19 UTC (13:27:19 IST), image revision `87a405a3a768bfcee327578035ec895a030c351b`.
Detached runner holds the scheduler lock throughout processing and reuses the
existing random scheduler helper to schedule the next run after completion.
Processing and publication outcomes are pending.

## Worker image rebuild — merged PR #45, 12 November 2026

Built clean merged main `82432f75a7d269ad3247412afd28ed7e6976bb3a` on the server
and pushed `localhost:5000/aptus-worker:82432f75a7d269ad3247412afd28ed7e6976bb3a`.
Main CI passed. Verified OCI revision and registry digest
`sha256:65cb2a68b260bdbde114b32fef019fca0795eb990f45e069f5244ab7c6cfc145`.
Network-disabled, read-only `--help` startup passed.

Build only: existing worker container remains on `87a405a`; no container
replacement, scheduler/environment change, forced processing or live-provider
verification performed. The new healer is not deployed by this image build alone.
Build log: `/home/mrblackghost/aptus-releases/worker-build-82432f7.log`.

## Healer worker deployment and manual run — 12 November 2026

Replaced the stopped worker under the host scheduler lock with merged revision
`82432f75a7d269ad3247412afd28ed7e6976bb3a`, registry digest
`sha256:65cb2a68b260bdbde114b32fef019fca0795eb990f45e069f5244ab7c6cfc145`.
Verified image ID/OCI revision, exact environment preservation, user, command,
restart policy, volume and network. Rollback: `aptus-worker-before-healer-82432f7`.

Authorized manual run observed running at 09:49:39 UTC (15:19:39 IST).
Runner holds scheduler lock for the full cycle and uses existing scheduling helper
before/after the run. Processing results and publication counts remain pending.
Runner log: `/home/mrblackghost/aptus-releases/manual-worker-82432f7.log`.
Frontend/API untouched; no provider configuration or credentials changed.

## Manual three-notice correction — 12 November 2026

Three officially reviewed notices published as five job records through the
existing reviewed-ingestion API; all five public API reads returned 200. Exact
superseded draft bytes retired only after publication; originals preserved.
See [the recovery record](MANUAL_OFFICIAL_DRAFT_RECOVERY_2026-11-12.md) for sources,
receipts, corrected facts, cooldown diagnosis and remaining automation failures.
Worker image, provider settings and normal schedule unchanged by this operation.

## Post-correction manual worker run — 12 November 2026

User-authorized one-shot run confirmed running at 10:46:32 UTC (16:16:32 IST),
revision `82432f75a7d269ad3247412afd28ed7e6976bb3a`. Host scheduler lock held
through processing; existing scheduling helper selects the next gap afterward.
No image, environment or provider configuration changed. Results pending.
Log: `/home/mrblackghost/aptus-releases/rerun-worker-82432f7.log`.

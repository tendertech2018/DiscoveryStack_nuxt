# Production operations and release acceptance

This runbook separates a verified build from a verified live service. The October 2026 hardening adds operational probes, task observation, encrypted backups, safer owner access, and a dependency-advisory gate. It does not provision a paid host, change production data, activate providers, or establish a customer-data/model-quality claim.

## Before deploying

1. Review the diff and CI for the exact commit. Run both applications' `audit:security` commands, the public build/tests, and Nuxt typecheck/build/safe tests. The generated migration manifest must match the checked-in SQL files. Never edit an already-applied migration to make readiness green.
2. Use a non-sleeping Node service if background work must run reliably. Give it an explicit full source SHA (`RENDER_GIT_COMMIT`, `NUXT_OPERATIONS_BUILD_COMMIT`, or Docker build argument `DISCOVERYSTACK_BUILD_COMMIT`). `/api/__release` exposes the SHA; a marker alone is insufficient release evidence.
3. Configure secrets only through the host's secret store. Follow [owner authentication and vault rotation](owner-auth-provider-vault-rotation.md) before changing session/vault keys. Verify an existing admin can still sign in. The temporary password route is disabled by default and cannot create/promote an admin.
4. Back up the named production database with an approved read-only account, verify the encrypted file, copy it to an access-controlled offsite destination, and perform a separate isolated restore drill. Keep the backup key separately and verify recovery access. This repository does not upload backups or implement retention automatically.
5. Review and apply migrations through the existing controlled migration procedure only after approving the target, backup and maintenance window. Build, container startup, probes, and smoke tests do not apply migrations. Validate migration SQL on the same engine/version as the production host before rollout.
6. Keep provider and customer-automation flags disabled until their individual acceptance steps pass. Enable a narrowly scoped pilot first. Set shared edge rate limits for owner access when using proxies or multiple replicas.

## Health and readiness

| Path | Access | Meaning |
| --- | --- | --- |
| `/api/health`, `/health` | Public | Node process responds; no database connection is opened. |
| `/api/ready`, `/ready` | Public | HTTP 200 only when a source commit is known, database responds, and every migration ledger timestamp/hash matches the bundled manifest. Otherwise HTTP 503. |
| `/api/__release` | Public | Existing release marker plus source commit identity. |
| `/api/operations/readiness` | Existing owner session | Detailed sanitized database/migration and process-local task evidence. Unauthenticated requests return 401. |
| `/audit-lab/operations` | Owner workspace | Refreshable status page with task filters and links to the relevant operations pages. |

Public probes use `no-store`. They do not return database URLs, provider keys, customer data, or internal errors. Database checks have bounded timeouts and are briefly coalesced/cached to avoid one connection per concurrent probe. Use liveness for container restart policy and readiness for traffic/rollout acceptance; an unavailable database should not create a process restart storm.

Task observations record starts/completions, disabled outcomes, and success/failure. `not_observed`, stale, disabled, and healthy are distinct. Records are process-local and reset on restart; one healthy replica does not prove every replica is healthy or establish exactly-once scheduling. Add external uptime/alerting and a durable single-worker/lease strategy before horizontal scheduling scale. Confirm at least one intended real execution for every enabled task after deployment.

Thrown task failures are converted at the scheduler boundary to `OperationsTaskError` with the fixed code `TASK_RUN_THROWN`. Nitro's scheduler logs the task name and this sanitized error, not the original SQL, query parameters, provider payload or nested cause. The task still rejects and increments its failure heartbeat; this wrapper never retries work because an external side effect might already have completed. Individual handlers must also keep their own logging and persisted diagnostics free of sensitive data.

From `nuxt-app`, run a read-only smoke test against the exact deployment:

```sh
pnpm ops:smoke --origin https://YOUR_PRIVATE_ORIGIN --expect-commit FULL_40_CHARACTER_COMMIT
```

The command refuses redirects, public caching, missing/mismatched commit identity, unhealthy schema/database, and an open owner endpoint. It does not sign in, send email/LINE, charge money, publish content, or mutate the database. `--allow-not-ready-local` is available only for a loopback development origin.

## Encrypted database backup and isolated restoration

Prerequisites: compatible MySQL `mysql` and `mysqldump` binaries; an application database containing InnoDB base tables only; no concurrent DDL during the consistent snapshot (see the [official mysqldump single-transaction requirements](https://dev.mysql.com/doc/refman/8.4/en/mysqldump.html)). Views, non-InnoDB tables, triggers, routines and events are rejected. The backup account must have enough metadata visibility to detect these objects as well as read access to all application tables. If the database uses stored objects or another engine, use the database provider's vetted backup procedure instead.

Use a secret manager or a private shell environment to provide the following; do not paste secret values into shared terminals or committed files:

```text
DS_BACKUP_DATABASE_URL=mysql://BACKUP_USER:ENCODED_PASSWORD@DB_HOST:3306/DATABASE
DS_BACKUP_ENCRYPTION_KEY=64_HEX_CHARACTERS_FROM_32_RANDOM_BYTES
DS_BACKUP_SSL_CA=/absolute/path/to/trusted-ca.pem   # optional custom CA
```

The key is independent of session and provider-vault secrets. A remote snapshot requires TLS hostname verification. The tool never falls back to the application's `DATABASE_URL` and never places credentials in process arguments. Temporary client files are private and removed after use.

```sh
pnpm ops:backup snapshot --output /absolute/path/outside/repository/release.dsbackup
pnpm ops:backup verify --input /absolute/path/outside/repository/release.dsbackup
```

The file is gzip-compressed and AES-256-GCM authenticated, created exclusively with mode 0600. An existing file is never overwritten. Verification checks the complete authentication tag and reports a SHA-256 digest without opening a database. Losing the encryption key means losing the ability to restore the file. Store it separately with tested recovery access.

For a drill, create a disposable **empty** database named `ds_restore_*` on loopback and a non-root user scoped only to that database. Set `DS_RESTORE_DATABASE_URL` explicitly and retain the encryption key:

```sh
pnpm ops:backup restore-drill --input /absolute/path/outside/repository/release.dsbackup --confirm-isolated-restore
```

The command refuses remote targets, the source fingerprint, root, and nonempty targets. It verifies the complete encrypted file before importing. A failed import may leave partial data only in the disposable target; inspect and recreate that target before another drill. Then independently verify expected row counts, representative binary/Unicode values, and migration ledger contents. The tool deliberately has no production-restore command.

Each MySQL child command is bounded at 30 minutes; verification decompression is bounded at 100 GiB but has no separate wall-clock deadline. Use an operator/job-level timeout for the complete workflow. Monitor backup age, verification failures, offsite-copy completion and a documented restore-time/restore-point objective. A local encrypted file alone is not an offsite backup policy.

## Real customer pilot acceptance

Retain an evidence record containing the deployed commit, timestamps, customer/owner consent scope, draft/version reference and sanitized provider receipt IDs. Avoid raw content, personal data, tokens, or keys in operational logs.

- Sign in as the existing owner and verify unauthorized/private routes, logout, and session rotation.
- Send one approved real email and confirm delivery/bounce tracking and unsubscribe behavior.
- Enrol one consenting customer through the intended LINE flow. Verify the signature, draft-specific approval, expiry, rejection, retry/idempotency and revocation.
- Publish that exact approved draft to the authorized site. Reconcile the provider receipt and test retry/rollback procedures without duplicating publication.
- Explicitly approve measurement, collect the same published page's measurements, and confirm the persisted publication/approval lineage. A LINE approval is not consent to model training.
- Enable learning only for records with valid dedicated learning consent, de-identification and retention rules. Validate model behavior against sufficient real observations and retain human approval for model deployment.
- Exercise paid services/webhooks/refunds only in their sanctioned test environments before a separately approved live acceptance. Customer-site/registrar automation remains outside the platform-first launch requirement unless specifically included.

## Dependency advisory policy

Run `pnpm audit:security` in both active applications. New critical/high findings fail CI. Any accepted exception is tied to the exact advisory, installed version and dependency path, has a rationale and expiry, and must be re-reviewed when scope/version changes. Current exceptions are in `scripts/security/dependency-audit-exceptions.json`; inspect the file instead of treating a historical audit count as current. A passing exception gate is not a claim that there are no advisories.

## Rollback and incident response

Record the prior verified image/SHA and preserve it before rollout. If probes or pilot checks fail, pause the affected automation flags and roll back application traffic to the prior verified artifact when schema compatibility permits. Do not blindly roll back migrations or overwrite a live database. Database recovery requires a separately approved plan, isolated verification and a maintenance window. Keep keys needed to read both old and new vault envelopes until migration is complete. Assign an alert recipient and an incident owner before accepting customer work.

Data-format compatibility matters as well as schema compatibility: after any provider credential is written as `v2`, the pre-hardening `v1`-only image is not a valid rollback target. Retaining its old keys is insufficient. Use a verified `v2`-capable fallback, or pause the affected automation and roll forward to a corrected compatible release; see the vault rotation runbook.

## Local evidence from this change

The final Nuxt build (including TypeScript checking) passed. The full regression run against that fresh build passed **408 test files / 6,999 tests**, with **21 files / 84 tests skipped** by their integration gates; skipped tests are not acceptance evidence. The suite ran with application/provider/database credentials removed from its environment and loopback access for synthetic HTTP fixtures. Public-site check/build and its **14 files / 89 tests** also passed. The audit-policy tests passed **6/6**. These are local working-tree results, not a remote CI run or a deployed-source attestation.

An isolated MySQL 9.5 fixture applied all 58 migrations and created 210 tables. A separate synthetic database completed encrypted snapshot, authentication verification, and restore to an empty scoped loopback target. Binary, Traditional Chinese, NULL and migration-ledger values survived the round trip; a second restore into the populated target was refused. These checks used no production/customer/provider data and do not replace acceptance on the production database engine/version.

The built Node service also passed an actual HTTP/MySQL fixture check: readiness returned 200 for the exact ledger, 503 after changing one synthetic ledger hash, then 200 after restoring it. Anonymous owner-readiness returned 401; a synthetic owner saw all 58 migrations and 12 tasks, with unobserved tasks correctly preventing scheduler readiness. The read-only release smoke passed all four probes with a deliberately synthetic SHA. The operations page rendered in the browser, its filter and refresh worked, and the 390px viewport had document/body widths of 390px. This preview used a temporary read-only proxy with a synthetic owner session; it does not constitute real owner OAuth or mobile LINE acceptance.

The local Linux/arm64 image `discoverystack-hardening:local` passed Node 22.23.1 container acceptance under `--network none` and `--read-only`, running as the non-root `node` user. PNG, WebP and AVIF encoded and decoded successfully. Liveness returned 200; readiness without a database returned 503. The runtime did not contain the build toolchain or the two accepted advisory packages. This image was not pushed or deployed; the new remote CI job and the production target architecture still require their own run. Temporary synthetic databases, backup files, servers and preview were removed after acceptance.

The final image was rebuilt after the secret-role separation and setup-readiness alignment fixes, and the full container smoke passed again. Its local image ID is `sha256:582342e074769e08238f803bfb034927b0e9a45fff6bc743982ef54e75c43517` (104,739,053 bytes, Linux/arm64). The image remains available locally; the disposable smoke container was removed. This digest identifies the local image, not a registry publication or a Git source commit.

## Production preflight on 2026-10-10 (Asia/Taipei)

A fresh TLS-verified, read-only check of the deployment database reported TiDB v8.5.3-serverless, all 58 canonical migration timestamps/hashes in order, and 210 InnoDB base tables. The configured local owner identity matched exactly one existing admin. The account-visible metadata reported no triggers, routines or events. No DDL, migration-ledger edit, customer-data mutation or provider request was performed. This release therefore does not require a new migration; recheck the exact ledger immediately before rollout rather than replaying the historical 0056/0057 plan.

This check is not a backup/restore test, an exact live owner-session verification, or a deployment result. Host-side authentication/secret cutover, always-on scheduling, independent vault keys, backup recovery, exact candidate CI, deployed SHA and post-deployment smoke remain separate gates. Do not merge into an auto-deploy branch until the new authentication configuration is ready; a fail-closed login configuration must not become an accidental owner lockout.

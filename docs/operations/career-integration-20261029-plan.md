# Career latest-main integration implementation plan

Goal: integrate the verified #71–#76 cumulative stack onto main b600715d while retaining current product behavior, without commits, remote mutations, or existing-environment changes.

Architecture: Spring owns canonical Career business commands; Fastify retains document/Yjs and facade ownership. Main's per-user categories, V2-only schema, BlockNote document schema 2, history/restore, readable text and computation fixes remain authoritative.

Spec: user's six-part integration request, 2026-10-29. GitHub metadata and baseline logs are in the parent workspace.

## Constraints and review focus

- No commit/push/PR/deployment, no production DB or existing dev DB access.
- Existing integration HEAD 73d1b582 and its modified next-env.d.ts remain untouched.
- Existing main migrations and checksums are immutable. Production application history of the unmerged migrations is unknown; any renumbering is a local candidate with an explicit ledger compatibility guard.
- Owner isolation must cover Category, Property, Record, Relation and background operations.
- Schema versions, business record versions, document versions and command receipts have separate CAS boundaries.
- Legacy properties is a compatibility projection; canonical reads must not silently fall back after preparation.
- BlockNote schema 2 and projection worker must survive the older stack's schema 1 assumptions.
- Performance fixture errors must be distinguished from measured budget failures.

## Tasks

- [x] Read instructions, fetch current refs, inspect stack ancestry, capture baseline SHA and existing state.
- [x] Build shared packages and run root typecheck on unmodified main.
- [x] Run main Career/editor/computation/identity tests with isolated Mongo/Redis.
- [x] Run database migration/ownership baseline and isolated performance baseline.
- [x] Integrate `pr/76` once using `git merge --no-commit --no-ff`; resolve each conflict by behavior. No blanket ours/theirs.
- [x] Resolve contracts/storage/migrations: retain main V2-only and owner schema, carry business values and prepare forward migration after current main tip. Verify unchanged historical checksums, new DB, upgrade DB, rerun and partial failure.
- [x] Resolve Spring: adapt category owner guards and V2-only schema plus fixtures; test authenticated commands, CAS/idempotency and ownership.
- [x] Resolve Fastify/Worker: retain main readable consumers and BlockNote while wiring canonical commands/read projection/recovery. Build/typecheck then targeted integration tests.
- [x] Resolve Web/BFF: retain BlockNote/history and editable default categories while applying canonical value transport, pending operations and CAS behavior. Typecheck and focused tests.
- [x] Reproduce load fixture failure, correct fixture through canonical storage path, retain all budget assertions and rerun alone.
- [x] Run required root checks and selected infrastructure/end-to-end flows, review changes and record concrete failures/untested items.

## Verification commands

The parent `run-pnpm.ps1` pins test-only Mongo 127.0.0.1:57027, Redis 127.0.0.1:56389, AI off and deterministic Career AI. Logs are outside tracked product source. Run package builds before tests because imports use dist. Never run tests/builds that rewrite shared dist concurrently.

Baseline evidence so far: shared builds PASS; root typecheck PASS; Career/editor/computation/identity 144 PASS, 11 SKIP in 28 files. Main upgrade database `expresso_test_career_main_upgrade_20261029` contains 2 synthetic users, 7 defaults each, one custom category and one record.

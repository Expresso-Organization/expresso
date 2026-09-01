<!-- generated from coordination/execution-spec.json; schema=2 revision=4 sha256=da7142fa6ab4398046829fe9ab09214c746d72ff967a6e1ddcc9252d908a939b generator=1; do not edit -->
# Expresso MongoDB migration parallel implementation plan

- Canonical source: [`coordination/execution-spec.json`](../coordination/execution-spec.json)
- Checklist: [IMPLEMENTATION_CHECKLIST.md](./IMPLEMENTATION_CHECKLIST.md)
- Machine-readable graph: [`coordination/task-dag.json`](../coordination/task-dag.json)
- Live state: [`coordination/task-state.json`](../coordination/task-state.json)
- Execution spec revision: 4

## 1. Objective and operating principles

- Primary objective: minimize_verified_wall_clock.
- Worker runtime: isolated zero-MCP codex exec using user-configured gpt-5.6-luna xhigh.
- Integrate the smallest green unit continuously; do not wait for a whole wave.
- Treat tokens as a constraint and verified wall-clock time as the primary outcome.

## 2. Capacity and fitness gate

- Gate status: pass.
- Rationale: T04 이후 career와 jobs, T07 이후 importer와 사용자 흐름은 경로가 분리되며 단일 reviewer·integrator가 완료 단위마다 즉시 처리한다.
- Implementer slots: 2.
- Reviewer slots: 1.
- Target effective concurrency: 2.
- Review capacity: 1.
- Integration capacity: 1.

- ownership_partitioned: pass
- contracts_frozen_before_fanout: pass
- independent_evidence: pass
- review_capacity_planned: pass
- integration_capacity_planned: pass

## 3. Dependency, ownership, and integration schedule

| Task | Checklist IDs | Dependencies | Owner | Impl min | Integration target |
|---|---|---|---|---:|---|
| B0 | M0-01 | None | coordinator | 15 | codex/mongodb-migration |
| T01 | M1-01 | B0 | mongodb-01 | 25 | codex/mongodb-migration |
| T02 | M2-01 | T01 | mongodb-02 | 75 | codex/mongodb-migration |
| T03 | M3-01 | T02 | mongodb-03 | 40 | codex/mongodb-migration |
| T04 | M4-01 | T03 | mongodb-04 | 45 | codex/mongodb-migration |
| T05 | M5-01 | T04 | mongodb-05 | 50 | codex/mongodb-migration |
| T06 | M6-01 | T05 | mongodb-06 | 40 | codex/mongodb-migration |
| T07 | M7-01 | T04 | mongodb-07 | 55 | codex/mongodb-migration |
| T08 | M8-01 | T06, T07 | mongodb-08 | 60 | codex/mongodb-migration |
| T09 | M9-01 | T08 | mongodb-09 | 40 | codex/mongodb-migration |
| T10 | M10-01 | T09 | mongodb-10 | 40 | codex/mongodb-migration |
| T11 | M11-01 | T10 | mongodb-11 | 50 | codex/mongodb-migration |
| T12 | M12-01 | T11 | mongodb-12 | 70 | codex/mongodb-migration |
| T13 | M13-01 | T12 | mongodb-13 | 50 | codex/mongodb-migration |
| T14 | M14-01 | T13 | mongodb-14 | 60 | codex/mongodb-migration |
| T15 | M15-01 | T14 | mongodb-15 | 55 | codex/mongodb-migration |
| T16 | M16-01 | T07 | mongodb-16 | 60 | codex/mongodb-migration |
| T17 | M17-01 | T15, T16 | mongodb-17 | 60 | codex/mongodb-migration |
| T18 | M18-01 | T17 | mongodb-18 | 80 | codex/mongodb-migration |
| T19 | M19-01 | T18 | coordinator | 25 | codex/mongodb-migration |

## 4. Contract and fixture ownership

- External contracts: existing-api-contract-v1, redis-bullmq-v1, legacy-mysql-source-v1.
- Fixture owners: mongo-fixture-v1 -> T02.
- Each provided contract and mutable path has one active owner. Consumers depend transitively on providers.

## 5. Worker, communication, and review contract

- Dispatch only dependency-ready tasks from isolated worktrees.
- Workers send structured reports to the coordinator; the coordinator sends versioned, impact-targeted digests.
- A targeted worker acknowledges its required context version before its next active phase.
- Stream confirmed findings, prefer the warm original implementer, and split only path-disjoint correction lanes.
- Default review budget is two verdicts and one correction round. After that, require a coordinator decision.

## 6. Blocker and integration handling

- Contract changes route through the named owner and may revise the canonical spec.
- Review and integration queues are capacity-bounded and drained continuously.
- A material spec revision requires all generated views and live state provenance to be synchronized before dispatch.

## 7. Final gate

Run canonical-view drift validation, DAG/state validation, integrated tests, and the checklist evidence audit before reporting completion.

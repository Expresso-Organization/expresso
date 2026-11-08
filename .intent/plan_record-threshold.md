---
title: 일치도 · 추천의 기록 3건 조건 제거
slug: record-threshold
stage: plan
status: accepted
intent: .intent/intent_record-threshold.md
spec: .intent/spec_record-threshold.md
date: 2026-11-02
---

# 일치도 · 추천의 기록 3건 조건 제거 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `services/backend/src/modules/job-analysis/service.ts` | 일치도 계산 조건 `>= 3` → `> 0` |
| `services/backend/src/modules/jobs/service.ts` | `computeMatch` 거절 조건 `< 3` → `=== 0`, `required: 1` |
| `services/backend/src/modules/jobs/legacy-mysql-service.ts` | 같은 변경 |
| `services/backend/src/modules/jobs/jobs.integration.test.ts` | 0건 409 · 1건 성공 |
| `services/backend/src/modules/job-analysis/job-analysis.integration.test.ts` | 0건 점수 없음 · 1건 점수 저장 |
| `services/web/src/app/(app)/home/page.tsx` | 첫 실행 블록 문구 |
| `docs/Expresso 구현 명세서.dc.html` | 옛 문구 두 곳 |

## 작업 순서

1. 브랜치 `fix/record-threshold`를 `origin/main`에서 딴다 — `git log -1`이 81988a33(PR 155 머지).
2. 백엔드 세 곳의 조건을 바꾼다 — 백엔드 typecheck 통과.
3. 통합 테스트 두 파일을 새 기준으로 고친다 — `pnpm test:infra`에서 두 파일 통과.
4. 홈 문구와 명세서 문구를 바꾼다 — `grep -rn "3건만" services docs`가 비어 있다.
5. 전체 검증 후 커밋 · 푸시 · PR.

## 가장 위험한 단계

3단계. 통합 테스트는 실제 MongoDB를 쓰고 기록을 누적해서 만든다. 같은 사용자에 기록이 남아 있으면 0건 가정이 깨진다. 0건 확인은 새로 가입한 사용자로 한다. 깨지면 테스트만 되돌리고 원인을 본다. 제품 코드 변경은 비교식 한 줄씩이라 되돌리기 쉽다.

## 검증

```
pnpm --filter @expresso/backend typecheck
pnpm --filter @expresso/backend test
pnpm test:infra
pnpm --filter @expresso/web typecheck
pnpm --filter @expresso/web test
```

화면: 복사본 DB(`expresso_product_fixes`)의 로컬 서버에서 기록 0건 계정의 홈 첫 실행 블록 문구를 본다.

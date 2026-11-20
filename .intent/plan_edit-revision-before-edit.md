---
title: 편집 이력 복원 지점을 편집 직전 본문으로
slug: edit-revision-before-edit
stage: plan
date: 2026-11-14
---

# 편집 이력 복원 지점을 편집 직전 본문으로 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `services/backend/src/modules/career-editor/service.ts` | `recordEditRevision` 인자 · `captureBlockNoteSnapshotBefore` |
| `services/backend/src/modules/career-editor/service.test.ts` | 기존 10분 테스트 인자 · 조합 중 글자 테스트 |

## 작업 순서

1. 직전 스냅샷 함수와 이력 연결
2. 단위 테스트 — 「끝난 문장」 → 「끝난 문장 저는 ㅅ」 순서로 저장한 뒤 이력 스냅샷과 다시 연 본문 확인
3. career · career-editor 통합 테스트, 타입 검사

## 가장 위험한 단계

1단계. 직전 스냅샷이 최신 스냅샷으로 골라질 때 본문이 어긋나면 사용자 본문이 바뀐다. 테스트에서 다시 연 본문에 마지막 입력이 남아 있는지 본다.

## 검증

```
pnpm --filter @expresso/backend typecheck
npx vitest run src/modules/career-editor/ src/modules/career/   # TEST_MONGODB_URL 포함
```

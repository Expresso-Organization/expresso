---
title: AI 정리 역량 선택지 누적 방지
slug: competency-option-sprawl
stage: spec
status: draft
intent: .intent/intent_competency-option-sprawl.md
date: 2026-11-14
---

# AI 정리 역량 선택지 누적 방지 — 명세

## 요구사항

- [ ] `CleanupContext`에 `knownCompetencies: string[]`를 더한다. 비어 있으면 프롬프트 절을 싣지 않는다.
- [ ] `buildPrompt`(record-cleaner)가 「이미 있는 역량」 절을 싣는다. 같은 뜻이면 글자 그대로 쓰고, 없을 때만 새 이름을 짓고, 기록 하나에 3개까지라고 적는다. `RECORD_CLEANUP_PROMPT_VERSION` 2 → 3.
- [ ] `InterviewService.cleanupAnswer`가 기록 카테고리의 `competencies` 다중 선택 속성 선택지 이름을 읽어 넘긴다. legacy-mysql 경로는 빈 배열을 넘긴다.
- [ ] `optionIdsByNames`가 비교 키(`optionKey`)로 찾는다. 소문자로 바꾸고 공백 · `·・/,.()[]-_` 를 지운 문자열이다. 새 선택지는 들어온 표기 그대로 저장한다.

## 설계

- 재사용: 기존 `multiSelectValueByNames` · 카테고리 버전 조건 갱신, 기존 정리 계약과 `check` 경로.
- 개수 3은 출력 형식이 아니라 프롬프트 설명 문장으로 둔다(저장소 지침: 글자 수 · 개수 기준은 설명 문장). 계약 `max(8)`은 그대로 둔다.
- 선택지 이름은 정리 호출 전 트랜잭션 밖에서 읽는다. 읽은 뒤 바뀌어도 `optionIdsByNames`가 트랜잭션 안에서 다시 대조하므로 중복이 생기지 않는다.

## 버린 대안

- 서버에서 기록당 역량을 3개로 자르기: 모델이 고른 순서를 중요도로 믿을 근거가 없다.
- 기존 선택지 자동 병합 마이그레이션: 사용자가 직접 만든 선택지와 구분할 수 없다.
- 유사도(임베딩)로 합치기: 계산 근거를 설명할 수 없고 오병합하면 되돌리기 어렵다.

## 함정

- 비교 키가 빈 문자열이 되는 이름(기호만)은 합치지 않고 건너뛴다.
- 선택지 목록이 길면 프롬프트가 커진다. 이름만 싣고 60자 이하라 수백 개도 몇 KB다.

## 완료 기준

- `pnpm --filter @expresso/backend test` · `pnpm test:infra` · `pnpm typecheck` 통과.
- 새 테스트: `optionKey` 합치기, 정리 프롬프트의 기존 역량 절, 같은 카테고리 두 번 정리 시 선택지 수 유지.

---
title: 공고 분석 실패 원인 구분
slug: analysis-failure-codes
stage: intent
status: accepted
author: Nedian0Brien
date: 2026-10-29
---

# 공고 분석 실패 원인 구분

## 개발 목표와 의도

배포 서버에서 공고를 붙여 넣으면 "공고를 읽지 못했습니다 — 분석이 EXTRACTION_FAILED로 멈췄습니다"만
나왔다. 원인은 서버의 AI 공급자 설정(Codex)이 모델 호출마다 400으로 거절당하는 것이었는데, 화면과
DB에는 그 사실이 남지 않았다. 타임아웃, 레이트 리밋, 출력 오류, 공급자 사용 불가가 모두 같은
`EXTRACTION_FAILED`(다시 시도하면 된다는 표시)로 저장되기 때문이다. 그래서 원인을 서버 큐 기록까지
뒤져서야 찾았고, 다시 시도해도 같은 호출이 5번 반복됐다.

서버 설정은 이미 Claude Code로 바꿨다. 이 변경은 같은 일이 다시 생겼을 때 실패 코드만 보고
원인을 알 수 있게 한다. 같은 문제를 이미 푼 브루 작업(`brew-jobs.ts`)의 기준을 공고 분석에도 쓴다.

## 기능 목록

| 기능 | 설명 | 왜 필요한가 |
|---|---|---|
| AI 호출 실패 코드 보존 | 공고 분석이 AI 호출 오류로 멈추면 실패 화면과 저장된 기록에 `AI_TIMEOUT`, `AI_RATE_LIMITED`, `AI_INVALID_OUTPUT`, `AI_UNAVAILABLE` 중 실제 코드가 남는다. | 지금은 전부 `EXTRACTION_FAILED`라 서버 큐를 직접 열어 보기 전에는 원인을 알 수 없다. |
| 재시도 가능 여부 보존 | 레이트 리밋과 사용 불가처럼 AI 공급자가 "지금 다시 시도해도 소용없다"고 알린 실패는 재시도 가능 표시가 꺼진 채 저장된다. | 지금은 항상 "재시도 가능"으로 저장돼, 설정 오류도 다시 시도하면 될 것처럼 보인다. |
| 그 외 실패는 기존 코드 유지 | AI 오류가 아닌 예외(DB 오류 등)는 지금처럼 `EXTRACTION_FAILED`로 저장된다. 원문 근거 불일치(`INVALID_SOURCE_SPAN`)와 추출기 없음(`EXTRACTOR_UNAVAILABLE`)도 그대로다. | 화면과 다른 코드가 이 값에 기대고 있어, 바꾸는 범위를 AI 오류로 좁힌다. |

## 개발 목표

- AI 호출이 `AI_UNAVAILABLE`로 실패하는 상태에서 분석을 돌리면, 분석 결과 조회가 `failure.code`로 `AI_UNAVAILABLE`을 돌려준다(`EXTRACTION_FAILED`가 아니다).
- 같은 실패의 `failure.retryable`이 공급자가 알린 값과 같다. 타임아웃은 `true`, 레이트 리밋과 사용 불가는 `false`다.
- AI 오류가 아닌 예외로 멈추면 `EXTRACTION_FAILED`와 `retryable: true`가 그대로 나온다.
- 기존 공고 분석 테스트와 타입 검사가 모두 통과한다.

## 범위 밖과 제약

- 실패 화면의 문구와 코드 표기 방식은 바꾸지 않는다. 화면은 지금처럼 코드를 그대로 보여 준다.
- 큐의 재시도 횟수와 간격(5회)은 바꾸지 않는다. `retryable: false`로 저장돼도 큐는 그 분석을 지금처럼 다시 시도한다.
- 서버 설정 변경은 이미 끝났고 이 변경에 포함하지 않는다.
- 사용 중이 아닌 MySQL 이전 코드(`legacy-mysql-service.ts`)는 건드리지 않는다.

## 열린 질문

없음.

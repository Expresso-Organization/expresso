---
title: 구조화 생성 내용 정리 단계의 재요청과 연락처 고정
slug: structured-content-retry
stage: plan
status: accepted
intent: .intent/intent_structured-content-retry.md
spec: .intent/spec_structured-content-retry.md
date: 2026-10-15
---

# 구조화 생성 내용 정리 단계의 재요청과 연락처 고정 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `packages/contracts/src/structured-portfolio.ts` | `StructuredProfileSchema`, `StructuredContentModelSchema` |
| `packages/contracts/src/structured-portfolio.test.ts` | 모델 스키마에 `contact`·규칙 없음, 저장 계약은 규칙 유지 |
| `packages/contracts/src/page.ts` | `PAGE_PROMPT_VERSION` 8과 이유(기준값 7) |
| `services/backend/src/modules/page/structured-generator.ts` | 내용 정리 재요청 고리, `normalizedContent`, 지시문에서 contact 문장 제거 |
| `services/backend/src/modules/page/structured-generator.test.ts` | 재요청·연락처·오류 구분 테스트, 기존 중단 테스트 수정 |
| `docs/architecture/portfolio-structured-pipeline.md` | 내용 정리 재요청 한 단락 |

구현 중 이 표에서 벗어나면 같은 커밋에서 이 파일을 고친다.

## 작업 순서

1. 계약 분리와 계약 테스트 — `pnpm --filter @expresso/contracts test`가 통과하면 끝난 것이다.
2. 생성기 재요청 고리와 단위 테스트 — 새 테스트와 기존 생성기 테스트가 모두 통과하면 끝난 것이다.
3. 프롬프트 버전과 문서, 전체 검증 명령.
4. 체험 서버에서 디자인 선택 → 생성을 실행하고 저장 CSS 값을 확인한다.

## 가장 위험한 단계

4단계입니다. 재요청을 넣어도 같은 규칙을 두 번 어기면 여전히 실패합니다. 실패하면 두 출력의 위반 내용을 로그에서 모아 보고하고, 규칙 문구나 지시문 수정은 따로 정합니다. 체험 생성은 최대 두 번만 실행합니다.

## 검증

```
pnpm typecheck
pnpm test
pnpm test:infra integration.test.ts --maxWorkers=2
```

화면 확인: 체험 서버(웹 3107)의 기존 브루 `2b535544-…/design`에서 "이 디자인으로 만들기"를 누릅니다. 생성이 끝나면 편집기를 열고, 저장된 지면 CSS를 DB에서 확인합니다.

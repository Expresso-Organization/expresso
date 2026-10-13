---
title: 구조화 Spec 생성의 재시도 대상 분리와 프롬프트 형식 설명 단일화
slug: spec-retry-prompt
stage: plan
status: accepted
intent: .intent/intent_spec-retry-prompt.md
spec: .intent/spec_spec-retry-prompt.md
date: 2026-10-13
---

# 구조화 Spec 생성의 재시도 대상 분리와 프롬프트 형식 설명 단일화 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `packages/portfolio-renderer/src/renderer.tsx` | `validateRenderableSpec`, `StructuredRenderError` 추가. 렌더링 예외·크기 초과 감싸기 |
| `packages/portfolio-renderer/src/index.ts` | 두 이름 내보내기 |
| `packages/portfolio-renderer/src/renderer.test.ts` | 오류 코드 테스트 추가 |
| `services/backend/src/modules/page/generator.ts` | `PageRenderError` 추가 |
| `services/backend/src/modules/page/structured-spec-format.ts` (새 파일) | `describeSpecSchema`, `describeGroupRules` |
| `services/backend/src/modules/page/structured-spec-format.test.ts` (새 파일) | 설명과 스키마의 일치 테스트 |
| `services/backend/src/modules/page/structured-generator.ts` | 고리 두 단계 분리, 프롬프트가 스키마를 받아 형식 설명 생성 |
| `services/backend/src/modules/page/structured-generator.test.ts` | 렌더 예외 1회 호출, 프롬프트 ID 일치 테스트 |
| `packages/contracts/src/page.ts` | `PAGE_PROMPT_VERSION` 9와 주석 |
| `docs/architecture/portfolio-structured-pipeline.md` | 재시도 대상과 프롬프트 생성 방식 한 단락 |

구현 중 이 표에서 벗어나면 같은 커밋에서 이 파일을 고친다.

## 작업 순서

1. 변경 전 프롬프트 전문을 고정 입력(테스트의 가상 프로필)으로 scratchpad에 저장한다. 파일이 있으면 끝난 것이다.
2. 렌더러에 `validateRenderableSpec`·`StructuredRenderError`를 추가한다. `pnpm --filter @expresso/portfolio-renderer test`가 통과하면 끝난 것이다.
3. `PageRenderError`를 추가하고 생성기 고리를 둘로 나눈다. 렌더 예외 테스트(호출 1회)와 기존 재시도 테스트(호출 2회)가 통과하면 끝난 것이다.
4. `structured-spec-format.ts`와 그 테스트를 쓴다. 실제 `structuredModelSchema` 출력으로 요소 ID와 props 키가 일치하면 끝난 것이다.
5. `structuredSpecPrompt`의 손글씨 형식 설명을 생성 결과로 바꾸고, 어긋나는 layout 지시를 뺀다. 프롬프트 ID 일치 테스트가 통과하고, 변경 후 전문이 1단계 전문과 같은 규칙을 담으면 끝난 것이다(눈으로 대조).
6. 프롬프트 버전과 문서를 갱신한다. 전체 검증 명령을 돌린다.

## 가장 위험한 단계

5단계입니다. 생성된 설명이 손글씨보다 모델이 읽기 어렵거나, 손글씨에 있던 규칙이 빠지면 생성 실패율이 오를 수 있습니다. 이번 범위에서는 실제 모델을 다시 호출하지 않으므로 전·후 전문을 PR에 붙여 규칙 누락을 리뷰로 확인합니다. 문제가 생기면 5단계 커밋만 되돌리면 됩니다. 재시도 분리(2–3단계)와는 커밋이 나뉘어 있습니다.

## 검증

```
pnpm typecheck
pnpm test
pnpm test:infra integration.test.ts --maxWorkers=2
```

UI 변경은 없습니다.

---
title: 수치 출처 검사의 HTML 엔티티 오탐 수정
slug: visible-text-entities
stage: spec
status: accepted
intent: .intent/intent_visible-text-entities.md
date: 2026-10-28
---

# 수치 출처 검사의 HTML 엔티티 오탐 수정 — 명세

## 요구사항

- [ ] `decodeHtmlEntities(value)`는 한 번 훑어 아래 표기를 글자로 바꿉니다. 그 밖의 `&name;`은 그대로 둡니다.
  - `&nbsp;` → 공백, `&lt;` · `&gt;` · `&quot;` · `&apos;`
  - 10진 숫자 표기 `&#NN;`, 16진 숫자 표기 `&#xHH;`
  - `&amp;`는 마지막에 풉니다.
- [ ] `visibleText(html)`는 태그를 지운 뒤 `decodeHtmlEntities`로 풀고 공백을 합칩니다. 태그를 지우기 전에 풀지 않습니다. `&lt;script&gt;`가 태그로 바뀌어 지워지는 일을 막습니다.
- [ ] `'모아 UI'`가 든 렌더 HTML에서 `ungroundedNumbers(visibleText(html), source)`가 빈 목록입니다.
- [ ] 공고 수집기 `jobs/ingest/adapter.ts`의 `decodeEntities`와 `work24-web.ts`의 `decode`는 반복 횟수(세 번) 규칙은 두고, 한 번 푸는 일을 `decodeHtmlEntities`로 합니다.

## 설계

- 새 파일 `services/backend/src/platform/html/entities.ts`에 `decodeHtmlEntities`를 둡니다. HTML을 다루는 플랫폼 코드(`sanitize.ts`)와 같은 자리입니다.
- `services/backend/src/modules/page/generator.ts`의 `visibleText`가 이 함수를 씁니다. `structured-generator.ts`는 `visibleText`를 그대로 가져다 쓰므로 함께 맞춰집니다.
- 공고 수집기 두 곳은 반복 루프 안의 치환 사슬을 이 함수 호출로 바꿉니다. `work24-web.ts`의 `decode`는 숫자 표기를 풀지 않았습니다. 이제 `&#NN;` · `&#xHH;`도 풉니다.

## 버린 대안

- 렌더러가 따옴표를 표기 없이 내보내게 하기: React `renderToStaticMarkup`의 이스케이프를 바꿀 수 없고, 바꾸면 안 됩니다.
- `ungroundedNumbers`가 `&#`로 시작하는 숫자를 건너뛰기: 숫자 규칙에 HTML 사정이 섞입니다. 보이는 글을 뽑는 쪽의 책임입니다.
- 외부 라이브러리(`he` 등) 추가: 필요한 표기가 몇 개뿐이고, 저장소에 이미 손으로 푼 코드가 있어 그것을 하나로 모읍니다.

## 함정

- 잘못된 코드 포인트(`&#xFFFFFFF;`)는 `String.fromCodePoint`가 예외를 냅니다. 유효 범위(0–0x10FFFF)를 벗어나면 그대로 둡니다.
- 공고 수집기 결과가 바뀌면 안 됩니다. 기존 테스트(`adapter` · `work24-web`)를 그대로 돌려 확인합니다.

## 완료 기준

- `pnpm --filter @expresso/backend test`가 통과하고, `entities` 테스트와 `visibleText` 수치 검사 테스트가 들어 있습니다.
- `pnpm typecheck` · `pnpm test`가 통과합니다.

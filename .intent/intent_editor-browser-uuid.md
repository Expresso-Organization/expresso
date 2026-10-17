---
title: 편집기 패키지 브라우저 UUID 생성 오류 수정
slug: editor-browser-uuid
stage: intent
status: accepted
author: Nedian0Brien
date: 2026-10-15
---

# 편집기 패키지 브라우저 UUID 생성 오류 수정

## 문제

`packages/editor/src/document.ts`와 `markdown.ts`가 `import { randomUUID } from "node:crypto"`를 쓴다.
웹(Next.js 16 + Turbopack)이 이 패키지를 브라우저 번들에 넣으면 `node:crypto`가 crypto-browserify로
바뀌고, 거기에는 `randomUUID`가 없다. 그래서 브라우저에서 `createEmptyCareerDocument()`나
`markdownToCareerDocument()`가 불리면 `TypeError: ...randomUUID is not a function`이 난다.

재현: `CAREER_EDITOR_V2_ENABLED=false`인 백엔드에서 기록 상세(`/career/records/:id`)를 연다.
`GET /api/career/records/:id/document`가 404를 돌려주면 `CareerEditorSession.bootstrap`이
`createEmptyCareerDocument()`로 넘어가고, 여기서 오류가 나서 화면이 "문서를 불러오고 있습니다."에 멈춘다.
main에서도 같다.

## 원하는 결과

- v2 플래그가 꺼진 백엔드에서 기록 상세를 열면 bootstrap 404 뒤 `createEmptyCareerDocument()`가
  성공하고, 세션 상태가 `offline`이 되며 빈 문단 하나짜리 문서로 편집기가 그려진다.
  브라우저 콘솔에 `randomUUID is not a function`이 없다.
- `packages/editor`의 런타임 소스(테스트 제외)에 `node:` 내장 모듈 import가 없다.
  이를 단언하는 테스트가 있고, 수정 전 코드에서는 실패한다.
- 웹 jsdom 환경에서 두 함수를 부르는 테스트가 있다.
- 서버(Node 24)에서 두 함수의 동작은 바뀌지 않는다 — 기존 editor · backend 테스트가 통과한다.

## 영향 범위

- 패키지: `packages/editor`(`document.ts`, `markdown.ts`)
- 화면: 웹의 기록 상세 편집기(`CareerEditorSession`, `CareerDocumentEditor`)
- 서버: 같은 함수를 쓰는 백엔드 경로(동작 변화 없음)
- 다른 공유 패키지 조사 결과: `contracts` 런타임 소스에 `node:` import 없음,
  `portfolio-renderer`는 테스트 파일에만 `node:fs`, `database`는 Node 전용이며 웹 의존성이 아님.
  고칠 곳은 editor 두 파일뿐이다.

## 제약

- 전역 `globalThis.crypto.randomUUID()`를 쓴다. 근거:
  Node 24 `globals` 문서 — `crypto` 전역은 v19에서 플래그 없이, v23에서 실험 단계를 벗어났다.
  Node 24 `webcrypto` 문서 — `globalThis.crypto`는 `Crypto` 인스턴스이고 `crypto.randomUUID()`는 v16.7.0에 추가.
  MDN — 브라우저에서 2022년 3월부터 널리 지원, secure context 전용.
- 웹이 editor를 `dist`로 가져오므로 소스 수정 뒤 `pnpm --filter @expresso/editor build`가 필요하다.

## 범위 밖

- `randomUUID`가 없는 비보안(평문 HTTP · 비 localhost) 출처를 위한 폴백. 현재 개발 출처
  (`127.0.0.1`, `localhost`)와 운영(HTTPS)은 모두 secure context다.
- bootstrap 404가 반복될 때 `scheduleReconnect`가 계속 재시도하는 동작.
- v2 플래그 기본값 변경, 백엔드 문서 API 변경.
- `next.config.ts`의 `transpilePackages`에 editor를 넣는 일.

## 열린 질문

없음

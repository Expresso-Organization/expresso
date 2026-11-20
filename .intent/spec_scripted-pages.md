---
title: 지면에 canvas · three.js 그림 싣기
slug: scripted-pages
stage: spec
date: 2026-11-20
---

# 요구사항과 설계

## 원칙

JS는 태그처럼 허용 목록으로 거를 수 없다. 안전은 **틀(sandbox)과 CSP**가 진다. HTML 소독은 지금 그대로 두고(`<script>` · `on*` 제거),
스크립트는 `css`처럼 별도 칸 `script`로 받는다.

## 계약 (`packages/contracts/src/page.ts`)

- `PageDraftSchema` · `GeneratedPageSchema` · `DesignSnippetSchema`에 `script: z.string().max(PAGE_MAX_BYTES).optional()`. 옛 행은 칸이 없다 — DB 검증 규칙이 추가 속성을 막지 않아 마이그레이션은 없다.
- `PAGE_ALLOWED_TAGS`에 `canvas`(속성 `width` · `height`).
- `PAGE_SCRIPT_LIBRARY` — three.js 한 판의 정확한 주소(jsDelivr `three@0.170.0/build/three.module.min.js`). 지면은 import map으로 `"three"`를 이 주소에 묶는다.
- `pageScriptText(script)` — `</script` · `<!--`를 무력화(`<\/script` · `<\!--`)한다. 해시도 이 결과로 잰다.
- `sha256Base64(text)` — 동기 SHA-256. `pageDocument`가 클라이언트 부품에서도 돌기 때문이다.
- `pageDocument({ …, script?, run?: { origin, extraScripts? } })`
  - `run`이 없거나 `script`가 비면 지금과 같은 문서(스크립트 없음).
  - `run`이 있으면 import map · `<script type="module">`을 붙이고, 머리에 CSP를 단다:
    `default-src 'none'; script-src <해시들> <라이브러리 주소>; style-src 'unsafe-inline' <서체 호스트>; font-src <서체 호스트>; img-src <origin> data: blob:; connect-src 'none'; form-action 'none'; base-uri 'none'; frame-src 'none'; worker-src 'none'`.
    `extraScripts`는 같은 문서에 함께 넣을 우리 스크립트(편집 스크립트 · 추적 스크립트)의 원문이다 — 해시를 같은 정책에 넣는다. CSP가 둘이면 교집합이 되어 서로를 막는다.

## 저장 경로 (백엔드)

- 디자인 대화 첫 화면(`design-chat/prompts.ts`의 그리기 · 고치기 출력)과 자유 생성(`briefed-generator.ts`)의 출력에 `script` 칸. 고치기 조각(`applyEdits`)의 `in`에 `script`.
- 이어 쓰는 지면은 첫 화면의 스크립트를 그대로 잇고, 모델이 덧붙인 스크립트를 뒤에 붙인다. 지면 고치기(`element-edit`)는 스크립트를 건드리지 않고 옮긴다.
- 저장 전 `pageScriptText`. 배포 스냅샷은 `run`을 주지 않은 문서와 원문 스크립트를 함께 싣지 않고, `pageDocument({ run: { origin: "" } })`로 지은 문서를 싣는다 — 실제 origin과 추적 스크립트는 웹이 `withSiteTracker`에서 정책에 넣는다.
- `ChromiumPageMeasurer`는 `javaScriptEnabled: false`.

## 보는 자리

| 자리 | 틀 | 스크립트 |
|---|---|---|
| 배포 지면 `SiteFrame` | `allow-scripts allow-popups` (지금 그대로) | 돈다. `withSiteTracker`가 기존 정책에 추적 해시 · origin을 넣는다 |
| 디자인 대화 첫 화면 `Stage` | `sandbox=""` → 스크립트가 있으면 `allow-scripts` | 돈다 (사용자 지시 「sandbox 완화 금지」를 뒤집는 자리 — 보고에 적는다) |
| 다듬기 `EditablePagePreview` | `allow-scripts` (지금 그대로) | 돈다. 편집 스크립트 해시를 같은 정책에 넣는다 |
| 생성 중 `LivePreview` | `allow-same-origin` | 돌지 않는다 |
| `PagePreview` · 미리보기 경로 | `sandbox=""` · `script-src 'none'` | 돌지 않는다 |

## 스크립트 없는 첫 모습 · 지침

- 지침(`design-rules.ts`): 첫 화면 그림은 기록 · 스타일 · 강조점에서 나온 추상 그래픽. canvas · three.js는 스크립트가 없어도 보이는 CSS 첫 모습(배경 · 그라데이션 · SVG) 위에 얹는다. `prefers-reduced-motion`이면 한 장면만 그리고 멈춘다. WebGL이 없으면 첫 모습을 남긴다. 스크립트는 자기 컨테이너 안만 만진다.
- 남는 위험: 틀의 자기 이동(`location = …`), 무한 반복으로 방문자 탭이 멈추는 것.

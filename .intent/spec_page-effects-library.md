---
title: 지면 3D · 입자 효과 라이브러리
slug: page-effects-library
stage: spec
date: 2026-11-21
---

# 요구사항과 설계

## 원본과 묶음

- `packages/contracts/effects/`
  - `vendor/vanta/` — Vanta 0.5.24 원본 중 쓰는 파일(`_base` · `_shaderBase` · `helpers` · net · fog · globe · waves · dots · halo · cells)과 `LICENSE.md`. 고친 자리는 파일 머리에 적는다(DOTS의 THREE 전달).
  - `runtime.js` — `window.ExpressoEffects = { mount(name, opts) }`. 공통: 팔레트(`{ background, ink, accent, soft }` #rrggbb) → 효과 옵션, `prefers-reduced-motion`이면 첫 장면 뒤 멈춤, 화면 밖이면 멈춤, 실패하면 아무것도 하지 않음(CSS 첫 모습이 남는다).
  - `effects/*.js` — 효과마다 `register(name, { mount })`. Vanta 감싸기, three 부가 모듈(MarchingCubes · GPUComputationRenderer · RoomEnvironment, MIT)로 짓는 메타볼 · 수면 물결, 블루프린트 선화.
  - `catalog.json` — 효과마다 이름 · 모습 · 어울리는 쓰임 · 바탕(밝음 · 어두움) · 차원(2d · 3d) · 넘길 값 · 상호작용 · 출처 · 판 · 라이선스.
- `scripts/build-effects.mjs` — esbuild로 효과마다 ESM 묶음(`three`는 바깥, import map이 푼다). `src/page-effects.generated.ts`에 `PAGE_EFFECT_RUNTIME` · `PAGE_EFFECTS[name]` · `PAGE_EFFECT_CATALOG`. devDependencies: `three@0.170.0` · `esbuild`.

## 문서에 싣기 (`pageDocument`)

- 모듈 중 `ExpressoEffects.mount("이름"`을 찾아, 런타임 + 그 효과들의 묶음을 `<script type="module">`로 저자 모듈보다 앞에 싣는다(모듈은 문서 순서대로 돈다). 해시를 정책에 넣는다.
- 안 쓰면 지금과 같은 문서.

## 지침

- `PAGE_SCRIPT_PROMPT`에 「효과 라이브러리」 — 목록(카탈로그에서 생성) · 부르는 법 · 팔레트 · 값.
- `design-rules.ts` · 그래픽 차원 문단: 3D · 입자 · 인터랙티브 배경 · 상호작용 물체는 라이브러리에서 고른다. 직접 짜는 것은 canvas 2D 생성 그래픽뿐이다. 공중에 오브젝트 하나를 띄우지 않는다.
- 판 올림: `PAGE_PROMPT_VERSION` 21, `DESIGN_CHAT_PROMPT_VERSION` 10.

## 고친 범위 (2026-11-21)

- 카탈로그: net · dots · fog · cells · blueprint. `metaballs.js` · `globe.js` · `vanta.globe.js` · `vanta.waves.js`를 지우고, 빌드의 three 부가 모듈 고지를 뺐다.
- `PAGE_SCRIPT_PROMPT`: 직접 그리는 그림은 canvas 2D. three.js 형체 장면 절을 지우고 「형체를 짓거나 띄우지 않는다」를 둔다. `PAGE_PROMPT_VERSION` 22 · `DESIGN_CHAT_PROMPT_VERSION` 11.
- 세포 무늬(cells)도 뺐다 — 견본을 본 사용자 "세포 무늬는 좀 이상하네. 저건 빼자". 남은 것: net · dots · fog · blueprint.

---
title: 첫 화면 3D를 3d-motion-web 엔진으로
slug: motionweb-engine
stage: spec
date: 2026-11-20
---

# 요구사항과 설계

## 엔진 들여오기

- `packages/contracts/scripts/vendor-motionweb.mjs <스킬 assets 폴더>` → `src/page-engine.generated.ts`.
  `PAGE_SCRIPT_ENGINE` = `window.MOTIONWEB_WGSL_STD = "<wgsl-std>";` + `hg-sdf.js` + `engine.js` 원문(라이선스 고지 그대로, 약 82KB).
  손으로 고치지 않는다. 고지는 `packages/contracts/THIRD-PARTY.md`에.
- `pageDocument({ script, run })`: 모듈 중 하나라도 `MotionWeb`을 쓰면 import map 앞에 엔진을 classic `<script>`로 싣고 해시를 정책에 넣는다. 안 쓰면 지금과 같은 문서.

## 지침

- `PAGE_SCRIPT_PROMPT`에 「3D 엔진 — MotionWeb」: `await MotionWeb.create({ canvas, fragment, uniforms, seed, camera, onError })` · WGSL 계약(`map` 필수, `shadeSurface` 필수, `background` · `cameraOrigin` 선택) · `u.time` 등 · hg-sdf · wgsl-std 헬퍼 · 재질(검은 크롬 · 액체 금속 · 굴절 유리 · 서리 유리 · 무광 세라믹 · 자체발광) · 빛(`env()` 스트립 · 키+림 · 컬러 젤 · 그라디언트 돔) · WGSL 함정 · `onError: () => {}`.
- `design-rules.ts`: 깊이 있는 장면의 공들인 오브젝트는 MotionWeb으로, 입자 · 선의 장은 three.js로. 팔레트는 고른 스타일의 색.
- 판 올림: `PAGE_PROMPT_VERSION` 19, `DESIGN_CHAT_PROMPT_VERSION` 7.

## 남는 것

- 엔진 문자열이 contracts에 있어 웹 클라이언트 묶음이 약 82KB 커진다(`pageDocument`를 쓰는 화면).
- WebGPU가 없는 브라우저(macOS Firefox 145 미만 등)는 첫 모습만 본다.

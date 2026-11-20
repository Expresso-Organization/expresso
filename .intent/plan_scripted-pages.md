---
title: 지면에 canvas · three.js 그림 싣기
slug: scripted-pages
stage: plan
date: 2026-11-20
---

# 구현 계획

1. **계약** — `page.ts`: `script` 칸 · `canvas` · `PAGE_SCRIPT_LIBRARY` · `pageScriptText` · `sha256Base64` · `pageDocument`의 `run`. `design-chat.ts`: 견본 `script`. 테스트: 해시가 Node `crypto`와 같다, `run` 없으면 문서가 지금과 같다, `</script` 무력화.
2. **백엔드 저장 경로** — 그리기 · 고치기 · 자유 생성 출력 `script`, 첫 화면 스크립트 잇기, element-edit 보존, 배포 스냅샷, 측정기 JS 끔. 테스트: page 모듈 · publishing.
3. **웹 보는 자리** — `withSiteTracker` 정책 합치기(공개 지면은 방문자가 연 주소를 그림 출처로), `DesignChat`의 `Frame`(스크립트가 있는 첫 화면만 `allow-scripts`), `EditablePagePreview`, 편집 화면의 「배포될 HTML」. 앱 출처는 `lib/app-origin.ts`. 테스트: site-tracker.
4. **지침** — 추상 그래픽 · 첫 모습 · 동작 줄이기 · WebGL 없음.
5. **점검** — headless Chrome으로 적대 스크립트 지면을 배포 · 첫 화면 · 다듬기 자리에서 열어 막힘 확인. 실제 생성으로 첫 화면 견본 확인 후 사용자에게 보인다.
6. `pnpm typecheck` · `pnpm test` · `pnpm test:infra`, 커밋 · 푸시.

## 검증

- 적대 스크립트: `fetch` · `new Image().src` · `parent.document` · `document.cookie` · `localStorage` · `eval` · 바깥 스크립트 · WebSocket이 모두 실패하고 바깥에 닿은 요청이 0건. 추적 메시지 흉내는 막지 못한다(남는 위험).
- 정상 스크립트: canvas 2D · three.js 장면이 세 자리에서 그려진다.

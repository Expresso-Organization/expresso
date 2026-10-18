---
title: 관심 공고 다시 찾아가기 — 사이드바 링크와 목록 필터
slug: job-interest-wayfinding
stage: plan
status: accepted
intent: .intent/intent_job-interest-wayfinding.md
spec: .intent/spec_job-interest-wayfinding.md
date: 2026-10-17
---

# 관심 공고 다시 찾아가기 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `services/web/src/app/(app)/jobs/list-query.ts` | `interested` 키 · 값 고정 · `isInterestedList` |
| `services/web/src/app/(app)/jobs/list-query.test.ts` | 왕복 · 값 폐기 테스트 |
| `services/web/src/app/(app)/jobs/page.tsx` | 관심 모드 · `listHref` · 토글 링크 · 레일 `전체` |
| `services/web/src/app/(app)/jobs/page.module.css` | `.headActionActive` · `.railHeadLink` |
| `services/web/src/components/shell/SidebarInterests.tsx` (새 파일) | 관심 줄 링크 · 활성 표시 |
| `services/web/src/components/shell/SidebarInterests.test.tsx` (새 파일) | 링크 주소 · 활성 표시 테스트 |
| `services/web/src/components/shell/Sidebar.tsx` | 관심 줄을 `SidebarInterests`로, "+"를 `/jobs` 링크로 |

## 작업 순서

1. `list-query` + 테스트 — `vitest run list-query` 통과.
2. `page.tsx` 관심 모드 — 타입 검사 통과, 서버 렌더 주소 확인.
3. 사이드바 조각 + 테스트 — `vitest run SidebarInterests` 통과.
4. 전체 `typecheck` · `test`.
5. 전용 포트 dev 서버(웹 · API)를 띄워 headless Chrome 스크립트로 완료 기준의 경로를 따라간다.

## 가장 위험한 단계

2단계. 주소 조립 함수 다섯 자리를 한 기준으로 모으면서 관심 모드가 아닐 때의 주소가 바뀌면 기존 필터 · 쪽 이동이 깨진다. `listHref`는 관심 모드가 아닐 때 기존 끝부분과 같은 문자열을 내도록 하고, 비관심 모드 주소를 화면에서 한 번 더 비교한다. 깨지면 그 커밋만 되돌린다.

## 검증

```
pnpm --filter @expresso/web typecheck
pnpm --filter @expresso/web test
node <scratchpad>/check-interest.mjs http://127.0.0.1:<웹 포트>
```

화면: 사이드바 관심 줄 클릭, `/jobs` 머리 "관심 공고 N" 켜고 끄기, 관심 모드에서 카테고리 칩 · 2쪽 · 상세 → "목록으로".

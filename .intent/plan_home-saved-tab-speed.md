---
title: 홈 공고 카드 관심 탭 즉시 전환
slug: home-saved-tab-speed
stage: plan
status: accepted
intent: .intent/intent_home-saved-tab-speed.md
spec: .intent/spec_home-saved-tab-speed.md
date: 2026-11-10
---

# 홈 공고 카드 관심 탭 즉시 전환 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `services/web/src/app/(app)/home/home-model.ts` | `jobsTabShown` · `allJobsQuery` 추가 |
| `services/web/src/app/(app)/home/home-model.test.ts` | 두 함수 테스트 |
| `services/web/src/app/(app)/home/HomeJobsTabs.tsx` (새로) | 탭 상태 · 세그먼트 단추 · 「전체」 링크 · 슬롯 선택 |
| `services/web/src/app/(app)/home/HomeJobs.tsx` | 두 목록을 슬롯으로 그려 `HomeJobsTabs`에 넘김, 머리 주석 갱신 |
| `services/web/src/app/(app)/home/page.module.css` | `.segmentItem`에 `font-family: inherit` |

## 작업 순서

1. `home-model.ts` 두 함수와 테스트 — `pnpm --filter @expresso/web exec vitest run src/app/\(app\)/home` 통과.
2. `HomeJobsTabs.tsx` 작성 — 타입 검사 통과.
3. `HomeJobs.tsx`를 슬롯 방식으로 바꾸고 주석 갱신, CSS 한 줄 — 타입 검사 통과.
4. 이 워크트리에서 `next dev`를 띄워(`hometab.localhost`, 이미 떠 있는 API에 연결) 관심 공고가 있는 계정으로 확인.
5. `pnpm typecheck` · `pnpm test`.

## 가장 위험한 단계

4단계 — `replaceState` 뒤 Next 라우터 상태. 주소만 바뀌고 서버 렌더가 일어나지 않는지, 새로고침 · 다른 화면 갔다 돌아오기에서 탭이 맞는지 본다. 어긋나면 `HomeJobs.tsx`를 `<Link>` 방식으로 되돌리면 된다(변경이 홈 폴더 안에 갇혀 있다).

## 검증

```
pnpm --filter @expresso/web typecheck
pnpm --filter @expresso/web test
pnpm typecheck
pnpm test
```

화면: `http://hometab.localhost:<포트>/api/dev/session?next=/home` → 관심 단추 클릭 → `_rsc` 요청 없음 · 주소 `/home?tab=interested` · 「전체」 href 확인 → 새로고침 → 관심 탭 활성 → 첫 탭 클릭 → 주소 `/home`.

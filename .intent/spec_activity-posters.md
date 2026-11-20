---
title: 활동 포스터 카드 그리드
slug: activity-posters
stage: spec
status: accepted
date: 2026-11-20
---

# 활동 포스터 카드 그리드 — 명세

## 요구사항

1. **R1 출처의 그림 주소**: `ActivityRow`에 `posterUrl: string | null`. 링커리어는 GraphQL `thumbnailImage { url }`, 위비티는 이미 읽는 상세의 첫 `/upload/contest/` 그림, 콘테스트코리아는 상세(`view.php`)의 alt 있는 `/admincenter/files/meet/` 그림, Dev-Event는 행사 페이지의 `og:image`, 부트텐트는 캠프 객체의 `image`. 그림을 못 찾거나 상세 요청이 실패해도 그 출처는 실패가 아니다(`null`).
2. **R2 보관**: 수집이 활동을 저장한 뒤 `posterUrl`이 있는 활동의 그림을 받는다. 같은 원 주소로 이미 보관했으면 받지 않는다. 받은 그림은 `sharp`로 폭 480px(확대하지 않음) webp로 줄여 `activity_posters`(`_id` = 활동 id, `sourceUrl` · `data` · `mediaType` · `width` · `height` · `checksum` · `readAt`)에 둔다. 활동 문서에 `poster: { width, height, checksum }`을 적는다. `posterUrl`이 `null`이면 있던 포스터를 그대로 둔다(일시 실패로 지우지 않는다). 받기 실패는 수집을 실패시키지 않고 결과에 센다(`posters: { stored, failed }`).
3. **R3 받기 제한**: 요청 하나 15초, 응답 8MB 이하, `content-type`이 `image/`인 것만. 동시에 4개.
4. **R4 내보내기**: `GET /v1/activities/:id/poster` — 회사 로고와 같은 헤더(1년 `immutable`, `nosniff`, `default-src 'none'; sandbox`). 없으면 404. 인증 없음(로고와 같다).
5. **R5 계약**: `ActivitySchema`에 `poster: { url, width, height } | null`. `url`은 `${API_PREFIX}/activities/:id/poster?v=<checksum 앞 16자>`.
6. **R6 화면**: 탐색의 공모전 · 해커톤 · 부트캠프 목록(`ExploreActivities`)이 시안 B 카드의 워터폴 그리드가 된다. 인턴은 그대로. 쪽 넘기기(100건)는 그대로.
7. **R7 마이그레이션 0039**: `activity_posters` 컬렉션(검증 규칙)과 `activities.poster` 칸.

## 설계

- **배치(`components/ui/Masonry.tsx`)**: 도메인을 모르는 클라이언트 부품. `items`, 열 폭에서 높이를 추정하는 `estimate(item, columnWidth)`, `render(item)`, `minColumn` · `gap`을 받는다. `ResizeObserver`로 폭을 재 열 수를 정하고, 앞에서부터 가장 짧은 열에 넣는다. `minColumn`으로 두 열이 들어가지 않는 폭이면 `minColumnNarrow`(150)로 내려 휴대폰에서도 2열이 되게 한다. 폭을 재기 전에는 보이지 않는다.
- **카드(`app/(app)/jobs/ActivityWall.tsx`의 `ActivityCard`)**: `Masonry`는 함수(`render`)를 받는 클라이언트 부품이라, 서버 화면이 아니라 이 클라이언트 파일이 카드를 그린다. 시안 B. 포스터는 `<img width height loading="lazy">`라 그림이 오기 전에도 높이가 잡힌다. 주소는 `CompanyAvatar`처럼 `new URL(url, API_BASE_URL)`. 포스터 없는 카드는 `CompanyAvatar`(`initial`은 앞머리를 건너뛴 첫 글자). D-day · 줄 문구는 기존 `activityLine`.
- **수집(`modules/activities/posters.ts`)**: `storeActivityPosters(db, rows, fetch)`. 서비스의 `collect`가 출처마다 저장한 뒤 부른다. 실제 요청은 주입한 `fetch`라 테스트가 가짜 응답을 준다.
- **콘테스트코리아 · Dev-Event 상세 요청**: 출처의 `fetchPage`를 그대로 쓴다(사용자 에이전트 `Mozilla/5.0`).

## 열린 질문

없음.

---
title: 사용자 눈에 보이는 결함 넷 정리
slug: user-facing-fixes
stage: plan
status: accepted
intent: .intent/intent_user-facing-fixes.md
spec: .intent/spec_user-facing-fixes.md
date: 2026-11-02
---

# 사용자 눈에 보이는 결함 넷 정리 — 구현 계획

브랜치 `fix/product-polish`, 기준 `origin/main` 0a972a48. 경로는 `services/web/src/` 아래다.

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `app/(auth)/AuthAside.tsx` | `stats` 블록 삭제 |
| `app/(auth)/auth.module.css` | `.stats` · `.statValue` · `.statLabel` 삭제 |
| `app/site/[slug]/page.tsx` | `loadPublication`(`cache`)과 `generateMetadata` 추가, 페이지가 같은 로더를 쓰게 변경 |
| `app/robots.ts` (새 파일) | 앱 경로 금지 · 나머지 허용 |
| `proxy.ts` | 공개 호스트에서 `/robots.txt` 통과 |
| `app/(app)/home/page.tsx` | 추천 행을 링크 + 폼으로, 진행 중 카드를 `ActiveBrewCard`로 |
| `app/(app)/jobs/[jobId]/page.tsx` | `facts()`의 기술 스택 행에 `technologies.length === 0` 조건 |
| `app/(app)/jobs/page.module.css` | 767px 이하 `.headNote` 숨김, `.headAction` nowrap. 모든 폭에서 `.categoryTabList` 가로 스크롤, `.categoryTab` nowrap |
| `app/(app)/jobs/page.tsx` | 카테고리 탭 링크를 `.categoryTabList`로 감싸 `SortMenu`를 스크롤 영역 밖에 둔다 |
| `app/(app)/edit/[portfolioId]/Editor.tsx` | 배지의 `costUsd` 접미사 삭제 |
| `app/(app)/career/page.tsx` (새 파일) | 첫 카테고리로 `redirect` |

구현 중 이 표에서 벗어나면 같은 커밋에서 이 파일을 고친다.

## 작업 순서

1. 로그인 지면 — `AuthAside.tsx`와 CSS에서 수치 블록을 지운다. `grep -n "stat" app/(auth)/auth.module.css`가 비면 끝.
2. 편집기 배지 — `Editor.tsx`에서 `costUsd` 세 줄을 지운다. `grep -n costUsd Editor.tsx`가 비면 끝.
3. 공고 상세 — `facts()`의 첫 행에 조건을 붙인다. 요건이 있는 공고 상세에서 칩 묶음이 하나인지 본다.
4. `/career` — `career/page.tsx`를 만든다. `/career`를 열면 `/career/experience`로 넘어간다.
5. 공고 탐색 모바일 — CSS 네 규칙을 767px 미디어 블록에 더한다. 375px에서 머리와 탭을 본다.
6. 홈 버튼 — 추천 행과 진행 중 카드를 바꾼다. 「만들기」가 `/brew/new/{id}`로, 「이어서 답하기」가 `/brew/{id}/{단계}`로 가는지 본다.
7. 공개 사이트 메타 — `loadPublication`과 `generateMetadata`를 쓴다. 배포된 사이트를 `curl`로 받아 `<title>` · `og:title` · `og:url` · robots 메타를 본다.
8. robots — `app/robots.ts`를 만들고 `proxy.ts`를 고친다. 앱 호스트와 공개 호스트에서 `/robots.txt`를 받는다.
9. 검증 — 아래 명령을 돌리고 결과를 붙인다.

## 가장 위험한 단계

7단계. `generateMetadata`가 페이지보다 먼저 돌면서 404 · 리다이렉트를 다르게 다루면 공개 사이트가 깨진다. 로더를 하나로 두고 `generateMetadata`에서는 예외를 삼켜 기본 제목만 돌려준다. 깨지면 `generateMetadata` 내보내기 한 줄을 지우면 이전과 같다.

6단계도 PR 118과 같은 파일을 고친다. 그 PR의 코드와 같은 구조로 써서 머지 때 한쪽을 고르면 되게 한다.

## 검증

```
pnpm --filter @expresso/web typecheck
pnpm --filter @expresso/web test
```

화면 확인(워크트리 웹을 `product.localhost` 호스트로 띄운다. API는 main 체크아웃의 4000번을 쓴다):

- `/login` · `/signup` — 왼쪽 패널에 숫자 칸이 없다.
- `/home` — 추천 공고 「만들기」와 「이어서 답하기」가 각각 제작 화면으로 간다.
- `/jobs` 375px — 수집처 문구가 없고 「관심 공고」 · 「알림 설정」이 한 줄, 카테고리 탭이 가로로 밀린다.
- `/jobs/{id}` — 기술 스택 묶음이 하나다.
- `/edit/{id}` — 배지에 달러 금액이 없다.
- `/career` — 첫 카테고리로 넘어간다.
- `curl -s http://{slug}.site.localhost:{port}/ | grep -o '<title>[^<]*</title>\|og:[a-z]*'` — 포트폴리오 제목과 og 태그가 있다.
- `curl -s http://product.localhost:{port}/robots.txt` — 텍스트 응답.

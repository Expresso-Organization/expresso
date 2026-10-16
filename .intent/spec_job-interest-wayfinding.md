---
title: 관심 공고 다시 찾아가기 — 사이드바 링크와 목록 필터
slug: job-interest-wayfinding
stage: spec
status: accepted
intent: .intent/intent_job-interest-wayfinding.md
date: 2026-10-17
---

# 관심 공고 다시 찾아가기 — 명세

## 요구사항

- [ ] 사이드바 관심 줄이 `/jobs/{id}` 링크다. pathname이 `/jobs/{id}`이면 그 줄에 `aria-current="page"`와 `rowActive`가 붙는다. `from`은 없다.
- [ ] 사이드바 "+"(`aria-label="관심 공고 추가"`)가 `/jobs` 링크다.
- [ ] `currentListQuery` · `backToListHref`가 `interested=true`를 보존하고, `true`가 아닌 값(`false`, `1`, 빈 값)은 버린다.
- [ ] `/jobs?interested=true`가 `jobs.postings`에 `interested: true`를 싣고, 주소에 `country`가 없으면 나라 조건을 걸지 않는다.
- [ ] 관심 모드에서 카테고리 칩 · 필터 4축 · 쪽 이동 · 해석 칩 · 검색 결과 정렬 · 검색 폼 제출 · 검색 초기화가 만든 주소가 모두 `interested=true`를 가진다.
- [ ] 머리 "관심 공고 N"이 링크다. 꺼져 있으면 `/jobs?interested=true`, 켜져 있으면 `/jobs`. 켜져 있으면 `aria-pressed="true"`, 채운 북마크 아이콘, 진한 글자.
- [ ] 결과 머리 문구가 관심 모드에서 "관심 공고 · N건", 0건이면 꼬리 문구가 "조건에 맞는 관심 공고가 없습니다".
- [ ] 06 레일 "관심 공고" 머리에 `전체` 링크(`/jobs?interested=true`)가 있다.

## 설계

- **주소의 단일 기준**: `list-query.ts`에 `"interested"`를 `FILTER_KEYS`에 더하고, 값이 정해진 키는 `FIXED_VALUES = { interested: ["true"] }`로 거른다. 화면이 읽는 판정도 같은 파일의 `isInterestedList(params)` 하나로 둔다.
- **목록 주소 조립**: `page.tsx`의 `filterHref` · `pageHref` · `conditionHref`가 각자 `URLSearchParams`를 만든 뒤 `?`를 붙이던 끝부분을 `listHref(search)` 하나로 모은다. `listHref`가 관심 모드면 `interested=true`를 싣는다. 모듈 함수 `chipHref`와 검색 정렬 링크도 `listHref`를 거친다. 검색 폼 두 개(`BrowseSearchBar` · `SearchQueryCard`)는 관심 모드에서 `<input type="hidden" name="interested" value="true">`를 싣고, 검색 초기화 링크는 `listHref(빈 조건)`으로 간다.
- **나라 기본값**: `defaultCountry = interested ? "all" : DEFAULT_COUNTRY`. `country`, 주소에서 기본값을 생략하는 세 자리가 모두 이 값을 쓴다.
- **토글**: 머리 버튼을 `Link`로 바꾼다. 켤 때는 다른 조건 없이 `/jobs?interested=true`로 간다 — 머리 숫자 N이 조건 없이 센 값이라 목록 건수와 같아야 한다. 끌 때는 `/jobs`.
- **사이드바**: 관심 줄을 `SidebarCategories`와 같은 꼴의 클라이언트 조각 `SidebarInterests.tsx`로 뺀다(`usePathname`, `Link` + `data-row`). `SidebarInterest` 타입은 `Sidebar.tsx`에 그대로 둔다.
- **스타일**: `.headActionActive`(`color: var(--ex-fg)`, `font-weight: 600` — `categoryTabActive`와 같은 값), `.railHeadLink`(레일 머리 오른쪽 끝 링크). 새 색 · 크기 값 없음.

## 버린 대안

- 토글을 켤 때 지금 걸린 조건을 함께 들고 가기 — 머리 숫자와 목록 건수가 어긋난다.
- 사이드바 줄에 `from=interested=true` 달기 — 사이드바는 목록이 아니고, 다른 화면에서 들어온 사람에게 관심 목록으로 돌아가는 길을 강요한다.
- `interested`를 `filterHref` 등 각 함수에 하나씩 더하기 — 다섯 자리를 따로 고치면 하나를 놓치는 순간 필터가 풀린다.

## 함정

- `pageHref`는 `location`만 있고 `technology` · `family`를 싣지 않는다(기존 동작). 이번 범위 밖이다.
- 검색 정렬 링크는 지금 `q`와 `sort`만 싣는다. 관심 여부만 더하고 나머지 동작은 그대로 둔다.
- 숨은 브라우저 창에서는 rAF가 멈춰 하이드레이션이 안 된다 — 화면 확인은 headless Chrome으로 한다.

## 완료 기준

- `pnpm --filter @expresso/web typecheck` 통과, `pnpm --filter @expresso/web test` 통과(`list-query.test.ts`, `SidebarInterests.test.tsx` 포함).
- 워크트리 전용 서버에서 headless Chrome으로: 사이드바 줄 클릭 → 상세, 머리 버튼 → 관심 목록(건수 = N) → 칩 · 쪽 클릭 뒤에도 `interested=true` → 상세 → "목록으로" → 관심 목록.

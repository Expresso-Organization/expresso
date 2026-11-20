---
title: 공모전 · 해커톤 · 부트캠프 수집 출처 확장과 정확도 개선
slug: activity-sources
stage: spec
status: accepted
intent: .intent/intent_activity-sources.md
date: 2026-11-20
---

# 공모전 · 해커톤 · 부트캠프 수집 출처 확장과 정확도 개선 — 명세

## 요구사항

- [ ] 출처 다섯(`wevity` · `linkareer` · `contestkorea` · `devevent` · `boottent`)을 `activity_collect` 한 번에 차례로 읽는다.
- [ ] 위비티: SPECIAL 줄 포함, `stat` 배지 글자 제거, `hackathon`(대소문자 무시) 해커톤 판정. 접수 중 줄마다 상세 쪽을 읽어 접수 시작 · 마감 · 응모대상 · 상금 · 홈페이지를 얻는다. 상세를 못 읽은 줄만 D-N(기준일은 UTC 날짜)으로 마감을 계산한다.
- [ ] 출처가 응답하지 않거나 읽히는 줄이 하나도 없으면(마감 줄 포함) 그 출처는 실패다. 성공한 출처의 행은 저장하고, 실패가 하나라도 있으면 수집 작업은 `ActivityCollectError`로 실패한다. 출처별 마지막 실행 · 성공 시각 · 오류 · 읽은 건수가 `activity_sources`에 남는다.
- [ ] 목록(`ActivityService.list`)은 그 출처의 마지막 성공 실행에서 보인 활동만, 다른 활동의 중복이 아닌 것만 돌려준다.
- [ ] 중복 묶기: 마감일이 같고 (a) 원 공고 주소의 등록 도메인이 같거나(여러 행사를 싣는 플랫폼 도메인은 경로까지) (b) 정규화한 제목이 같으면 한 묶음. 묶음의 대표는 출처 우선순위(위비티 → 콘테스트코리아 → 링커리어 → Dev-Event)로 정한다.
- [ ] `kind`에 `bootcamp`, 활동에 `applyStartOn` · `startsOn` · `eligibility` · `prize` · `homepageUrl` · `tuition` · `nbcardRequired` · `deadlinePrecision`이 생긴다(모두 비울 수 있음).
- [ ] 능동 제안은 마감 순 100건이 아니라 새로 본 순 100건에서 후보를 고른다. 제안 표의 종류 칸에 부트캠프가 나온다.
- [ ] 탐색: 부트캠프 탭이 목록을 보인다. 행에 접수예정이면 시작일, 응모대상 · 상금(공모전) · 학비(부트캠프)가 보인다. 출처 안내 문구가 실제 출처를 적는다.

## 설계

재사용: `modules/activities`(서비스 · 라우트 · `seoulDate` · `daysUntil`), `activity_collect` 예약 잡과 `#announce`, `pickCandidates`의 `isFresh` · `matched`, 탐색 `ActivityList` 행 스타일(`explore.module.css`), 공고 수집의 "키 없는 출처는 빠지고 조용한 0건 성공은 없다" 원칙(`jobs/ingest/index.ts`).

- **출처 어댑터** `modules/activities/sources/`: `ActivitySource { name; fetch(at): Promise<ActivityRow[]> }`. `ActivityRow`는 저장 문서의 출처 공통 모양(`sourceId` · `kind` · 날짜 · 선택 항목). 읽은 쪽이 비었거나 모양이 다르면 `ActivitySourceError`를 던진다. 네트워크는 생성자로 받는 `fetchText`(시험에서 바꿔 끼움).
  - `wevity.ts`(기존 파일을 옮겨 고침) · `linkareer.ts`(GraphQL `activities`, `activityTypeID:"3"` · `status:"OPEN"`, 쪽당 100) · `contestkorea.ts`(`Txt_bcode=030310001`, 접수 중 줄이 없는 쪽에서 멈춤, 상한 5쪽) · `devevent.ts`(README 원문, `대회` 태그, 절 제목의 연도) · `boottent.ts`(`/camps`의 RSC 안 과정 객체, `regEndDate` 날짜 98 = 그달 안 → 말일 · `deadlinePrecision:"month"`).
- **수집** `ActivityService.collect(at)`: 출처마다 `fetch` → upsert(`_id: <source>:<sourceId>`, `firstSeenAt`은 처음만) → `activity_sources` 갱신. 끝나면 접수 중 문서 전체로 중복 묶음을 다시 계산해 `duplicateOf`를 쓴다(`dedupe.ts`, 순수 함수). 결과 `{ read, added, updated, sources: {name, read, error}[] }`.
- **예약 잡** `scheduling/service.ts`: `collect` → `#announce` → 실패 출처가 있으면 `ActivityCollectError`(이름이 `lastError`에 남음).
- **스키마** 마이그레이션 `0035`(`0034`는 열린 PR `feat/design-chat`이 씀): `activities` 검증 규칙의 `source` · `kind` enum 확장과 새 칸, `duplicateOf`, 색인 `activity_list`(`duplicateOf` · `kind` · `deadlineOn`). 새 컬렉션 `activity_sources`.
- **계약** `proposals.ts`: `ActivityKindSchema`에 `bootcamp`, `ActivitySchema`에 `source`와 새 칸, `ListActivitiesQuery`에 `offset`, 응답에 `summary.total`.
- **제안**: `list({ limit, sort: "fresh" })`(서비스 내부 인자), `writer.ts` 종류 칸 `bootcamp → 부트캠프`, `ProposalFeed`의 부트캠프 제목.
- **웹**: `ExploreActivities`가 부트캠프도 `ActivityList`로 그리고, 행 칸은 화면이 도메인 값을 글로 바꿔 넘긴다. 100건 넘으면 「더 보기」(`?offset=`).

## 버린 대안

- 출처 하나로 합친 정본 문서: `proposal_feeds.dismissed`가 `activity:<id>`를 들고 있어 id가 바뀌면 안 된다. 출처별 문서 + `duplicateOf`로 간다.
- 실패한 출처가 있어도 성공으로 끝내고 결과에만 적기: 지금의 "0건 성공"과 같은 문제가 남는다.
- 링커리어 교육: 부트캠프와 단발 강의를 가를 근거가 응답에 없다(intent 범위 밖).
- 제목 유사도(2-gram)로 중복 묶기: 기준값의 근거가 없다. 측정한 4쌍은 도메인 + 마감일로 모두 묶인다.

## 함정

- 실패 뒤 재시도는 수집을 처음부터 다시 하고 `added`가 0이라 `#announce`를 다시 부르지 않는다 — 첫 시도에서 이미 불렀으므로 맞다.
- 링커리어 · 부트텐트는 문서 없는 내부 형식이다. 바뀌면 어댑터가 던져 실패로 드러난다.
- 콘테스트코리아 · Dev-Event 날짜에는 연도가 없다. 콘테스트코리아는 D-N과 맞는 연도를, Dev-Event는 절 제목(`26년 11월`)을 쓴다.
- 위비티 상세 쪽은 302 → `gbn=viewok`이고 쿠키가 있어야 본문이 온다. 사이드 메뉴에 같은 낱말(응모대상)이 있어 정보 영역 안에서만 읽는다.
- 부트텐트 `startDate`가 모집 시작일과 같은 과정이 있다 — 모집 마감 이전 날짜면 수업 시작일로 쓰지 않는다.
- `.or.kr` · `.co.kr` · `.go.kr` · `.ac.kr`는 2단계 접미사다.
- 첫 수집에서 1천여 건이 한꺼번에 "새 활동"이 된다. 제안 후보는 사용자 기록과 겹치는 순으로 6건이라 폭주하지 않는다.

## 완료 기준

- `pnpm typecheck` · `pnpm test` · `pnpm test:infra` 통과.
- 실제 출처로 로컬 수집 한 번: 출처별 읽은 건수가 0보다 크고, 서울관광 프롬프톤 마감이 `2026-11-29`, 대구 기후 AI 활용대회가 목록에 한 번, 부트캠프 탭에 과정이 보인다.

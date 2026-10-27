---
title: 동작하지 않는 화면 요소 정리
slug: dead-ui-wiring
stage: spec
status: accepted
intent: .intent/intent_dead-ui-wiring.md
date: 2026-10-27
---

# 동작하지 않는 화면 요소 정리 — 명세

요소별 위치와 판정은 `inventory_dead-ui-wiring.md`. main a094541a 기준으로 다시 대조했다 — #100 머지로 `DesignCatalog`의 추천 · 맞는 이유가 데이터에서 그려져 범위에서 뺀다. #101 머지로 `LegacyCareerBrowser`가 사라졌다.

## 요구사항

- [ ] **알림 생성** — 포트폴리오 생성이 끝나면(`completeFreeHtml` 성공) `generation` 알림 1건, 관심 공고(`interests.stage = saved`)의 마감이 3일 안이면 공고당 `deadline` 알림 1건이 생긴다. 같은 생성 · 같은 공고로 두 번 생기지 않는다.
- [ ] 알림 응답에 화면에 적을 대상 이름 `subject`(포트폴리오 제목 · 「회사 · 공고 제목」)가 온다. 한 건 읽음 · 모두 읽음 라우트가 `readAt`을 채운다.
- [ ] ⌘K 검색은 `GET /search` 결과를 그리고, 알림 패널은 `GET /notifications`를 그린다. 안 읽은 수 = `readAt == null` 건수. `lib/sample`의 PALETTE · NOTIFICATIONS를 쓰지 않는다.
- [ ] 공고: 「조건 추가」 · 근무 칩 · 정렬 · 「이 검색 저장」 · 최근 검색 「지우기」 · 「이 경험 기록하기」 · 「포트폴리오 만들기」가 동작한다. 「알림 설정」은 설정의 알림 항목으로 간다.
- [ ] 홈 · 온보딩: 추천 공고 행과 「만들기」 · 「이어서 답하기」 · 「저장한 검색」이 동작하고, 첫 포트폴리오 화면은 `GET /home`의 추천 공고와 실제 기록 수를 그린다. 제작 단계 제목 연필로 브루 제목을 바꾼다.
- [ ] 편집: 데스크톱 · 모바일, 확대 · 축소, 넓게 보기, 되돌리기, HTML 보기, 미리보기, 테마 이동, 「이 부분만 AI에게」, 「내 커리어에서 가져오기」, 이력 필터 · 날짜 묶음 · 더 보기, ⌘↵가 동작한다. AI 제안을 적용한 이력은 `actor: "ai"`로 남는다.
- [ ] 설정: 사용량은 세션 `quota`, 내보내기는 JSON 파일 내려받기, 삭제 요청은 로그아웃 뒤 취소 코드를 한 번 보여 준다. 알림 항목에서 `deadline` · `generation`을 켜고 끈다.
- [ ] 제거: 분류표의 「제거」 행 전부와 사용처 없는 예시 데이터. `services/web/src/lib/sample`이 사라진다.

## 설계

- **알림 생성 자리.** 모듈 사이 호출은 진입점(`modules/engagement/index.ts`)으로만 한다.
  - 생성: `worker/processors/generation.ts`가 `completeFreeHtml` 성공 뒤 `EngagementService.notify(userId, "generation", "/edit/{portfolioId}", "generation:{jobId}")`. 알림 실패는 로그만 남기고 생성 결과를 바꾸지 않는다.
  - 마감: `scheduling`에 `deadline_reminders` 키(하루 1회)를 더한다. `expire_postings`처럼 `db.interests` · `db.jobPostings` · `db.companies`를 직접 읽는다. 대상은 `stage = saved`이고 `deadlineAt ?? posting.expiresAt`가 지금~72시간인 관심 공고. 실행기가 `notifications.findOne({ userId, dedupeKey: "deadline:{postingId}" })`를 먼저 보고 없을 때만 `notify`를 불러 날짜와 관계없이 한 번만 만든다. 줄마다 try/catch로 감싸 삭제된 사용자 하나가 실행 전체를 실패시키지 않게 한다.
  - 마이그레이션 `0020`(0014–0019는 열린 PR이 잡고 있다): `scheduled_job_definitions._id` enum에 `deadline_reminders`를 더하는 `collMod`, 정의 upsert(0007이 `job_sources`를 심는 방식), `notifications` 검증기에 `subject`.
- **`notify()`의 동작은 바꾸지 않는다**: 설정 꺼짐 → 만들지 않음, `(userId, dedupeKey, dedupeDate)` 하루 단위 중복 막기, `notification.deliver` 아웃박스. `subject`(nullable) 인자만 더해 문서 · 계약 · `dto`에 싣는다.
- **웹 호출**은 화면별 서버 액션(`*-actions.ts`)과 `lib/api/endpoints.ts`. 응답은 `request(path, Schema)`로 파싱한다. 클라이언트 컴포넌트(`CommandPalette`)는 서버 액션으로 읽는다.
- **편집 화면 보기 상태**(기기 · 배율 · 넓게)는 `Editor` 안의 상태다. 배율 칸 수치는 상태에서 계산한다. 미리보기는 `GET /portfolios/:id/page/document`를 세션 쿠키로 대신 부르는 웹 라우트를 새 탭으로 연다.
- **되돌리기**는 가장 최근 이력이 `revert`할 수 있는 블록 변경일 때만 켠다.
- **제거**는 요소와 그 요소만 쓰던 스타일 · 상수 · 컴포넌트까지 지운다. 화면 정의서 문구 `BROWSE_QUERY_PLACEHOLDER`는 `jobs/` 옆 파일로 옮긴다.
- 내보내기(PDF · 덱)는 웹 진입점을 지운다. 백엔드 `exports` 경로는 다른 클라이언트(`services/mobile` · `desktop`) 사용처를 확인하고, 없으면 함께 지운다.

## 버린 대안

- 알림 제목 · 본문을 백엔드가 문장으로 저장: 문구가 바뀔 때 기존 행이 낡는다. 종류 + `subject`만 두고 문장은 화면이 만든다.
- 마감 알림을 `expire_postings`(매시) 안에서 함께 만들기: 한 작업이 두 일을 해서 실패 원인이 섞인다.
- 알림 패널을 폴링: 패널을 열 때와 화면 이동 때 다시 읽는 것으로 충분하다.

## 함정

- `portfolio-editing/service.ts`는 #76(오시건)이 같은 파일 59–83행을 고친다. actor 기록은 다른 줄이지만 **손대기 전에 사용자에게 묻는다.**
- `worker/main.ts`에서 `generationProcessor`(88행)가 `engagementService`(120행)보다 먼저 만들어진다. engagement 생성을 위로 옮긴다. #111(사용자 본인 PR)도 이 파일을 고친다.
- `schema.test.ts`가 정의 수(8)와 적용된 마이그레이션 목록을 고정해 둔다. 0020을 넣으면 함께 고친다.
- `notificationPreferences` 검증기 모양과 서비스가 쓰는 모양이 다르다(기존 문제). 이번에 고치지 않는다.
- 공고 상세(#65 · #70), 커리어 보드 · 타임라인 · 문서 패널(#76), 카테고리 추가 · 트리 ＋(T1.1.2 · T1.1.4)는 손대지 않는다.

## 완료 기준

- `pnpm typecheck` · `pnpm test` · `pnpm test:infra` 통과.
- `node dead-buttons.cjs services/web/src` 결과에 분류표의 「연결」 · 「제거」 행이 남지 않는다. `grep -rn "lib/sample" services/web/src` 0건.
- dev01로 각 화면을 열어 요소를 눌러 본다. 생성 1회 뒤 알림 패널에 그 포트폴리오 알림이 보인다.

---
title: 사이드바 관심 공고 일치도 표시 제거
slug: sidebar-interest-score
stage: spec
status: accepted
intent: .intent/intent_sidebar-interest-score.md
date: 2026-11-10
---

# 사이드바 관심 공고 일치도 표시 제거 — 명세

## 요구사항

- [ ] `SidebarInterests`가 줄마다 아바타와 라벨만 그린다. 점수 `span`과 "분석 대기" `span`이 없다.
- [ ] `SidebarInterest` 타입에 `score`가 없고, `AppChrome`이 `job.match`를 읽지 않는다.
- [ ] `Sidebar.module.css`에서 쓰이지 않는 `.score` · `.scoreHigh` · `.scoreMid` · `.pending`이 지워진다.
- [ ] 헤더 건수(`interestTotal`)와 `+` 링크는 그대로 그려진다.
- [ ] 화면 정의서의 관심 공고 줄 60개(사이드바 20곳 × 3줄)에서 마지막 `span`이 지워진다.

## 설계

- `components/shell/SidebarInterests.tsx`: `{interest.score === null ? … : …}` 분기를 통째로 지운다. 줄은 `CompanyAvatar` + `.interestName` 라벨만 남는다. 라벨은 이미 `flex: 1`과 말줄임을 쓰므로 빈자리를 채운다.
- `components/shell/Sidebar.tsx`: `SidebarInterest`에서 `score: number | null`을 지운다. 타입이 좁아지면 `AppChrome.tsx`의 `score: job.match?.total ?? null`이 타입 오류가 되므로 함께 지운다. 그 위 주석의 "분석 대기" 언급도 고친다.
- `Sidebar.module.css`: 위 네 클래스를 지운다. 다른 곳에서 쓰지 않는 것을 `grep`으로 확인했다.
- `docs/Expresso Screens.dc.html`: 라벨 `토스 · 백엔드` · `당근 · 서버` · `카카오 · 플랫폼` 뒤의 `span`을 정규식으로 지운다. 각 20건씩 일치하고, 라벨만 같은 다른 곳(토스·당근 각 2건)은 패턴이 달라 건드리지 않는다.

## 버린 대안

- `%` 단위를 붙이고 85 기준 색을 걷어 남기기: 요청자가 제거를 골랐다.

## 함정

- `watchedJobs` 응답의 `match`는 계약에 남는다. 웹이 그 필드를 안 읽을 뿐이라 계약을 바꾸지 않는다.

## 완료 기준

- `pnpm --filter @expresso/web typecheck`와 `pnpm --filter @expresso/web test` 통과.
- 개발 서버 `/home`에서 사이드바 관심 공고 줄에 숫자 · "분석 대기"가 없고 헤더 건수는 있다.

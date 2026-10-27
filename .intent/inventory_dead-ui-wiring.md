# 동작하지 않는 화면 요소 목록 (2026-10-27, main 981bfa8f)

출처: 운영 스캔 report.json(10/26 판정, 같은 커밋) + 코드 직접 조사(핸들러 없는 `button` 추출, `lib/sample` 사용처, 고정 문구·수치, 백엔드 라우트 대조).
경로는 `services/web/src/` 기준. 백엔드는 `services/backend/src/modules/`(B) 기준.

판정
- **연결**: 백엔드 라우트와 계약이 있거나 서버가 필요 없다. 웹에서 부르거나 화면 상태로 처리하면 된다.
- **백엔드**: 서버 로직부터 만들어야 한다.
- **제거**: 만들 근거가 약하다. 10/27 intent 수락 때 모두 걷어내기로 정했다(장식 · 요금제 포함).
- **보류**: 열린 PR이 같은 파일을 고치거나 지운다. 그 PR이 머지된 뒤 다시 판정한다.

## A. 셸 · 통합 검색 · 알림 (박민재 T11.2.x)

| ID | 위치 | 요소 | 지금 | 판정 | 근거 · 메모 |
|---|---|---|---|---|---|
| T11.2.2 | components/CommandPalette.tsx:68-113 | 통합 검색 결과 | `lib/sample` PALETTE. 입력해도 안 바뀜 | 연결 | `GET /search`(B/engagement/routes.ts:21). 기록·포트폴리오·공고로 이동. 「동작」 그룹·BLOCK 종류·그룹 건수는 계약에 없어 뺀다 |
| T11.2.3 | CommandPalette.tsx:119-150 | 알림 목록 · 안 읽음 「3」 · 필터 | `lib/sample` NOTIFICATIONS | 백엔드 | `GET /notifications`는 있으나 `notify()`를 부르는 곳이 0곳이라 연결해도 늘 비어 있다. 계약에 제목·본문 없음(kind·targetUrl만) |
| T11.2.3 | CommandPalette.tsx:124 | 「모두 읽음」 | onClick 없음 | 백엔드 | readAt 쓰는 라우트 없음 |
| — | CommandPalette.tsx:64-65, 108-113 | 「홈 / 오늘 할 일」, 단축키 줄, 「최근 검색 3건」 | 고정 문구 | 제거 | 키 처리 · 이력 API 없음 |
| — | components/shell/SidebarNav.tsx:58 | 「검색 ⌘K」 행 | div, 핸들러 없음 | 연결 | 팔레트 열기 |
| — | components/shell/Sidebar.tsx:117 | 포트폴리오 추가 ＋ | onClick 없음 | 연결 | `/brew/new` 링크 |
| — | Sidebar.tsx:125 | 포트폴리오 행 | 링크 아님 | 연결 | `/edit/{id}` |
| — | Sidebar.tsx:149 | 방문 수 「—」 | 값이 안 넘어와 늘 「—」 | 제거 | 포트폴리오별 집계 API만 있음 |
| — | Sidebar.tsx:89 | 「Double Shot 추가」 | 동작 안 하는 요금제 화면으로 이동 | 제거 | |
| T1.1.2 | Sidebar.tsx:198, SidebarCategories.tsx:72 | 카테고리 추가(두 곳) | 핸들러 없음 | 연결 · 보류 | `POST /career/categories`(B/career/routes.ts:142). #105가 생성 계약을, #76(오시건)이 career 쓰기 경로를 바꾼다 |
| T1.1.4 | SidebarCategories.tsx:66-68 | 카테고리 행 ＋ | 링크 안의 장식 | 연결 · 보류 | `POST /career/records`. 같은 이유로 보류 |
| — | Sidebar.tsx:195 | 「카테고리 더 보기」 | onClick 없음 | 제거 | 명세 근거 없음 |
| — | SidebarCategories.tsx:49-51 | ▸ 캐럿 | 펼침 없음 | 제거 | |
| T11.2.5 | components/shell/WizardShell.tsx:26 | 「자동 저장됨」 | 기본값 고정, 넘기는 곳 없음 | 제거 | 제작 단계에 자동 저장 대상이 없다 |
| — | WizardShell.tsx:37-40 | 제목 칩 연필 | onClick 없음 | 백엔드 | 브루 제목 변경 라우트 없음(`UpdateBrewSchema`는 mode만) |
| T11.2.1 | edit/[portfolioId]/Editor.tsx:43-47 | 편집 레일 「새 포트폴리오」 활성, 「분석」 빨간 점 | 고정값 | 연결 | 현재 위치에서 계산. 빨간 점은 근거 없음 → 뺀다 |

## B. 공고 탐색 · 검색 (심민규 T2.x)

| ID | 위치 | 요소 | 지금 | 판정 | 근거 · 메모 |
|---|---|---|---|---|---|
| T2.2.2 | app/(app)/jobs/page.tsx:952 | 「조건 추가」 | onClick 없음 | 연결 | 기존 목록 파라미터 · `conditionHref` |
| T2.2.2 | jobs/page.tsx:915 | 해석 칩(근무) | 화살표만, 못 바꿈 | 연결 | ConditionChip 방식 |
| T2.2.2 | jobs/page.tsx:915 | 해석 칩(연봉 · 규모) | 결과에 반영 안 됨 | 백엔드 | 필터 파라미터 없음. 반영 전까지 칩을 띄우지 않는다 |
| T2.2.4 | jobs/page.tsx:956 | 「이 검색 저장」 | onClick 없음 | 연결 | `POST /jobs/saved-searches`. 재실행 · 신규 건수는 백엔드 |
| T2.2.5 | jobs/page.tsx:1083 | 최근 검색 「지우기」 | onClick 없음 | 연결 | `DELETE /jobs/recent-searches/:id`(한 건씩) |
| T2.2.5 | jobs/page.tsx:1061-1066 | 「비슷한 검색」 비면 샘플 | `SIMILAR_SEARCHES` 대체 | 제거 | 파생 질의 API 없음. 비면 묶음을 띄우지 않는 안 |
| — | jobs/page.tsx:619 | 「내 기록과 가까운 순」 | 고정 버튼 | 연결 | `?sort=` 링크 |
| — | jobs/page.tsx:1169 | 「마감 순」 | 고정 버튼(이미 마감 순) | 제거 | 라벨로 |
| T2.4.6 | jobs/page.tsx:567 | 「알림 설정」 | onClick 없음 | 백엔드 | 설정 API는 있으나 알림 생성이 없다(A의 T11.2.3과 함께) |
| — | jobs/page.tsx:1036, 1158 | 「이 경험 기록하기」 | onClick 없음 | 연결 | `/career/experience` 이동 |
| T3.1.1 | jobs/page.tsx:1197 | 「선택한 공고로 포트폴리오 만들기」 | onClick 없음, 고르는 UI 없음 | 연결 | `/brew/new`. 문구 수정 |
| — | jobs/page.tsx:980 | 「⌘↵」 | 키 처리 없음 | 제거 | |
| T2.4.4 | jobs/[jobId]/page.tsx:375-379 | 「질문 3개로 채울 수 있습니다」 | 모든 항목에 고정 | 보류 | 실제 배정은 요건당 1문항 · 전체 3–6(B/interview/questions.ts). #65 · #70(윤규현)이 같은 파일을 고친다 |

## C. 홈 · 온보딩 (박민재 T11.1.x, 오시건 T1.2.4)

| ID | 위치 | 요소 | 지금 | 판정 | 근거 · 메모 |
|---|---|---|---|---|---|
| T11.1.1 | app/(app)/home/page.tsx:149, 167 | 추천 공고 행 · 「만들기」 | 링크 아님 · onClick 없음 | 연결 | `/jobs/{id}`, `analyzePostingAction` |
| T11.1.2 | home/page.tsx:193 | 「이어서 답하기」 | onClick 없음 | 연결 | `resume-step.ts`로 단계 이동 |
| — | home/page.tsx:134 | 「추천 N」 세그먼트 | 단일 버튼 | 제거 | 라벨로 |
| — | home/page.tsx:223 | 포트폴리오 「전체 보기」 | `/home` 자기 자신 | 제거 | 목록 화면 없음 |
| T2.2.4 | home/HomeChrome.tsx:75 | 「저장한 검색」 | onClick 없음 | 연결 | `GET /jobs/saved-searches` |
| — | HomeChrome.tsx:58 | 「⌘K」 표시 | 입력창과 무관 | 제거 | |
| — | app/(auth)/onboarding/first-portfolio/page.tsx:8-36, 73, 82 | 공고 카드 3장 · 「기록 12건」 | 샘플 · onClick 없음 | 연결 | `GET /home` recommendedJobs, 세션 recordCount |
| — | first-portfolio/page.tsx:114 | 「질문 6개 · 평균 12분」 | 고정 | 제거 | 실제 3–6문항 |
| T1.2.4 | app/(auth)/onboarding/materials/page.tsx 전체 | 이력서 드롭존 · 「resume_2026.pdf」 · 「GitHub 읽는 중…」 · 「연결」 · 나눠 담기 7행 · 「숫자가 빈 기록 4건」 | 전부 샘플, 「기록 N건 만들기」는 저장 없이 이동 | 제거 | 이력서 · URL 추출 백엔드 없음 |
| — | app/(auth)/SocialSignIn.tsx:40 | GitHub 로그인 | 늘 disabled | 제거 | 백엔드 경로 없음 |

## D. 편집기 (박민재 T8.x)

| ID | 위치 | 요소 | 지금 | 판정 | 근거 · 메모 |
|---|---|---|---|---|---|
| T8.1.4 | edit/[portfolioId]/Editor.tsx:255-265, 623-632 | 데스크톱 · 모바일, 확대 · 축소, 「72%」 「데스크톱 1440」 | 핸들러 없음 · 고정 | 연결 | 화면 상태만 |
| — | Editor.tsx:645 | 넓게 보기 | onClick 없음 | 연결 | 화면 상태만 |
| — | Editor.tsx:269 | 되돌리기 | onClick 없음 | 연결 | `POST /portfolio-revisions/:id/revert`. 블록 변경만 되돌릴 수 있다. 섹션 · 자유 HTML 판은 백엔드 |
| — | Editor.tsx:272 | 다시 실행 | 늘 disabled | 제거 | redo 없음 |
| — | Editor.tsx:437 | 「HTML 직접 보기」 | onClick 없음 | 연결 | `GET /portfolios/:id/page/document` 또는 받은 `generatedPage.html` |
| — | Editor.tsx:296 | 「미리보기」 | onClick 없음 | 연결 | 같은 문서 라우트, 웹 프록시 필요 |
| — | Editor.tsx:292, 427 | 「테마」, 「테마 · 글꼴」 | onClick 없음 | 연결 | `/brew/{id}/design?again=1` 이동(다시 생성, 한도 소모) |
| — | Editor.tsx:432 | 「간격 · 여백 기준 · 보통」 | 고정 | 제거 | 지면 전체 간격 API 없음 |
| — | Editor.tsx:214 | 레일 도움말 | onClick 없음 | 제거 | |
| T8.1.2 | Editor.tsx:405-420 | 순서 개선 제안 + 「올리기」 「그대로 두기」 | `lib/sample` 문구 · 핸들러 없음 | 제거 | 제안 로직 없음. 수락은 `PATCH sections/order`로 가능 |
| T8.1.3 | Editor.tsx:324 | 섹션 추가 ＋ | onClick 없음 | 제거 | 섹션 생성 라우트 없음 |
| T8.1.1 | Editor.tsx:380 | 「숨김 · 직접 숨김」 | 사유 고정(B/portfolio-editing/service.ts:166) | 제거 | 사유를 받는 계약 없음. 사유 문구를 뺀다 |
| T8.2.1 | Editor.tsx:519-526, 614-621 | 「AI로 다듬기」 · 「이 부분만 AI에게」 | 탭만 바꾸고 고른 블록을 대상에 안 넣음 | 연결 | 화면 상태 |
| T8.4.1 | EditorPanels.tsx:715-725 | 이력 필터 전체 / AI 편집 / 직접 편집 | 핸들러 없음 | 백엔드 | actor 필터는 있으나 이력이 전부 `actor: "user"`로 기록됨(service.ts:102 · 123 · 205). AI 제안을 적용한 이력부터 ai로 기록해야 한다 |
| — | EditorPanels.tsx:736, 749 | 「오늘」, 아바타 「지」 | 고정 | 연결 | createdAt으로 묶기, displayName |
| — | edit/[portfolioId]/page.tsx:35 | 이력 20건에서 끝 | 더 보기 없음 | 연결 | cursor |
| T8.2.3 | (화면에 없음) | 「내 커리어에서 가져오기」 | `QUICK_COMMANDS` 미사용 | 연결 | `insert_record`(B/portfolio-editing/service.ts:59). 기록 고르기 UI 추가 |
| — | EditorPanels.tsx:194 | 「⌘↵」 | 키 처리 없음 | 연결 | 키 처리 추가 |
| — | EditorPanels.tsx:802-806 | 「잠금을 풀면 함께 고칩니다」 | 잠금 해제 없음 | 제거 | |
| — | EditorPanels.tsx:268-293 | `Stepper` | 렌더 안 되는 코드 | 걷어냄 | |

## E. 배포 · 디자인 (박민재 T9.x, T7.1.x)

| ID | 위치 | 요소 | 지금 | 판정 | 근거 · 메모 |
|---|---|---|---|---|---|
| T9.2.3 | edit/[portfolioId]/deploy/DeployPanel.tsx:239-256 | PDF · 덱 내보내기 | 가짜 경로 `exports/{userId}/{id}.{kind}`를 저장하고 바로 done(B/publishing/service.ts:87) | 제거 | 실제 파일 생성 없음. 다운로드 클라이언트도 없음 |
| T9.1.5 | DeployPanel.tsx:115-118 | 커스텀 도메인 「연결하지 않음」 · 「팀 요금제」 | 고정 | 제거 | 연결 라우트 없음 |
| T9.2.4 | (화면에 없음) | 이력서 파일 첨부 | — | 범위 밖 | 보이는 요소가 아니다 |
| — | deploy/page.tsx:94 | 「저장됨」 | 고정 | 제거 | |
| T7.1.1 · T7.1.3 | brew/[brewId]/design/DesignCatalog.tsx | 「추천」 고정, 「맞는 이유」 고정 문구, 「내 디자인」 「회사 웹사이트」 빈 탭 | 고정 | 보류 | #100(포트폴리오 유형, 548 파일)이 같은 화면을 바꾼다. `GET /recipes/:id/template-previews`는 있으나 템플릿이 연결된 디자인은 3개뿐 |
| — | brew/[brewId]/materials/page.tsx:38 | 「예상 3분」 | 고정 | 제거 | |
| T12.1.2 | MaterialPicker.tsx:344, Dashboard.tsx:729, 1087 | PRO 잠금 표시 | 업그레이드 링크 없음 | 제거 | 도착할 요금제 변경이 없다 |

## F. 계정 (윤규현 ADM-23, 오시건 ADM-24)

| ID | 위치 | 요소 | 지금 | 판정 | 근거 · 메모 |
|---|---|---|---|---|---|
| ADM-23 | app/(app)/account/page.tsx:43 | 「포트폴리오 생성 2 / 3 · 3월 12일 초기화」 | 샘플 | 연결 | 세션 `quota`(used · limit · resetsAt) |
| ADM-23 | page.tsx:43 | 「AI 인터뷰 4 / 10」 「배포 사이트 3 / 5」 | 샘플 | 제거 | 인터뷰 한도 없음. 배포 수는 셀 수 있으나 한도 없음 |
| ADM-23 | page.tsx:209 | 「이번 달 생성 1회가 남았습니다」 | 샘플 | 연결 | `remaining`, `resetsAt` |
| ADM-23 | page.tsx:77-96 | 요금제 3종 · 가격 · 「이 플랜으로」 「플랜 해지」 | 샘플 · 핸들러 없음 | 제거 | 요금제 목록 · 변경 라우트 없음. 현재 요금제는 `/me` planCode |
| — | page.tsx:112-118 | 결제 내역 · 「영수증」 | 샘플 | 제거 | 결제 코드 없음 |
| — | account/AccountNav.tsx:18 | 탭 프로필 · 요금제 · 결제 · 알림 · 데이터 | 둘째만 고정 활성, 핸들러 없음 | 연결 · 제거 | 알림 탭: `notification-preferences` API 있음. 프로필 수정 라우트 없음 |
| — | page.tsx:154 | 「내보내기」 | 핸들러 없음 | 연결 | `GET /account/export` → 파일 내려받기 라우트 |
| ADM-24 | page.tsx:154 | 「삭제 요청」 | 핸들러 없음 | 연결 | `POST /account/deletion`. 취소 토큰은 한 번만 온다. 웹 연결만 하고 백엔드(#70 · #74 · #76이 고치는 중)는 손대지 않는다 |

## G. 화면에 안 보이는 잔여물

- `lib/sample/analytics.ts` 전체, `site.ts`의 PUBLIC_SITE · DEPLOY, `editor.ts`의 EDITOR_SECTIONS · EDIT_EXCHANGE · QUICK_COMMANDS · REVISIONS · CHECKPOINTS: import 0건 → 걷어냄
- `brew/new/screen-definition-01.generated.ts`: import 0건 → 걷어냄
- `BROWSE_QUERY_PLACEHOLDER`: 정의서 문구다. `lib/sample`을 비우면서 jobs 화면 옆으로 옮긴다

## 열린 PR 때문에 손대지 않는 것

- `career/[categorySlug]/LegacyCareerBrowser.tsx` 필터 · 정렬 · 속성 · 뷰 탭: #101이 파일을 지운다
- `features/career-editor/views/BoardView · TimelineView · ViewToolbar`의 ←/→, 「수요 비교」 「인용 지표」, `career/[categorySlug]/DocumentPanel.tsx:124` 「저장됨」: #76(오시건)이 같은 파일을 고친다. #101 머지 뒤 화면에 나오므로 오시건과 정한다
- `jobs/[jobId]/page.tsx` T2.4.4: #65 · #70(윤규현)
- `DesignCatalog.tsx` T7.1.x: #100
- `Editor.tsx`(#104), `account/page.tsx`(#109), `deploy/deploy-actions.ts`(#24)는 겹침이 작다. 머지 뒤 받아서 진행한다

## report.json 판정과 다른 점

- T3.1.1 「검색결과 · 관심공고 목록 진입 버튼 동작 없음」: brew/new의 버튼은 동작한다. 죽은 진입 버튼은 jobs:1197과 home:167이다
- T8.4.1 「백엔드 actor 필터 있음」: 필터는 있으나 기록이 전부 user라 연결해도 AI 편집은 빈 목록이다
- T11.2.3: 알림 생성 호출이 0곳이라 웹 연결만으로는 해결되지 않는다
- T1.2.4: 가져오기 화면은 온보딩 `materials` 하나뿐이다

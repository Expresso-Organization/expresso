---
title: 02 레시피 고르기·고치기 화면 완성도
slug: recipe-step-ux
stage: spec
status: accepted
intent: .intent/intent_recipe-step-ux.md
date: 2026-09-15
---

# 02 레시피 고르기·고치기 화면 완성도 — 명세

## 요구사항

토큰과 규격
- [ ] `tokens.css`에 간격 `--ex-space-1…6`(4 · 8 · 12 · 16 · 24 · 32), 반경
      `--ex-radius-sm/md/lg/full`(4 · 8 · 16 · 9999), 조작 높이
      `--ex-control-md/sm/xs`(40 · 32 · 28)가 있다. 출처 주석에 design-ops
      web-comfortable 프로필을 적는다.
- [ ] Setup · Workbench 모듈 CSS에 간격 · 반경 · 조작 높이의 픽셀 리터럴이 없다.
      `grep -E '[0-9]+px'`로 남는 것은 보더 1px, 아이콘 크기, 열 폭뿐이다.
- [ ] 글자 색은 `--ex-fg-muted`(slate-500, 5.4:1)까지만 쓴다. `--ex-fg-subtle` ·
      `--ex-fg-faint`는 두 화면에서 글자 · 아이콘에 쓰지 않는다.

고르기(Setup)
- [ ] 1024px 이상에서 왼쪽(공고 · 기록 표)과 오른쪽 요약(`--ex-rail-width`) 두 칸이다.
      768px 미만에서는 한 칸으로 쌓이고 요약이 표 아래에 온다.
- [ ] 요약에 고른 기록 n / 10 · 분류별 분포 막대 · 지원할 공고 · 디자인 이름 ·
      제작 의도 다섯 칸 · 「레시피 만들기」(40px) · 소요 시간 문구가 있다.
- [ ] 공고가 없으면 표에 「순위 이유」 칸이 없다. 공고가 있으면 칸이 있고, 겹친
      말이 없는 줄은 비어 있다.
- [ ] 1440px에서 기록 제목이 잘리지 않는다(제목 칸 `minmax(260px, 1fr)`).
- [ ] 10건을 다 고르면 요약에 "10건까지 고를 수 있습니다"가 서고 나머지 체크는
      비활성이다.
- [ ] `?setup=1`로 들어와 섹션이 있는 레시피면 버튼이 「다시 짜기」이고, 누르면
      "지금 레시피 n섹션이 새 초안으로 바뀝니다. 고친 내용은 사라집니다." 확인
      단계가 먼저 선다.

고치기(Workbench)
- [ ] 섹션은 흰 카드(반경 lg · 안쪽 24px)이고 지면은 `--ex-bg-sunken`이다.
- [ ] 제목 18/600, 목적 13 muted, 핵심 메시지 13 body, 문장 14 fg. 목적 · 핵심
      메시지 · 문장은 `AutoTextarea`라 글 길이만큼 자란다. 1024px에서 잘리는 글이 없다.
- [ ] 섹션 도구 · 문장 도구는 항상 보인다(`--ex-fg-muted`). 높이 28px. 호버에서
      `--ex-fg`가 된다.
- [ ] 섹션과 문장에 드래그 손잡이가 있다. 섹션은 섹션끼리, 문장은 섹션 안과 섹션
      사이로 옮긴다. 놓는 순간 `reorder` 한 번이다. 드래그 중 놓일 자리가 보인다.
- [ ] 문장 도구 「⋯」 메뉴에 위로 · 아래로 · 맨 앞으로 · 맨 뒤로 · 섹션으로 이동(섹션
      목록)이 있다. 키보드로 열고 고를 수 있다.
- [ ] ⌘Z · ⇧⌘Z(글 입력 칸 밖에서)가 실행 취소 · 다시 실행이다. 상단에 두 버튼도 있다.
      되돌린 상태가 서버에 저장된다.
- [ ] 편집은 화면에 먼저 반영된다(`update_*` · `delete_*` · `bind/unbind` ·
      `reorder`). 새 id가 필요한 `add_*` · `duplicate_item`은 서버 응답을 기다린다.
      저장 요청은 한 줄로 차례를 지킨다.
- [ ] 머리말의 저장 자리가 저장 중 · 저장됨 · 저장 실패를 실제 상태로 보인다. 실패하면
      서버가 돌려준 판으로 화면이 돌아가고 실패 문구가 보인다.
- [ ] 고른 문장 아래에 근거 줄이 선다. 중심은 에스프레소 색, 보조는 회색이다. 카드를
      누르면 뗀다. 「+ 기록」이 고른 기록 중 아직 안 붙은 것을 보인다. 공고 요건
      근거는 요건 문장(`criteria[].label`)이 보인다.
- [ ] 섹션 끝의 「참고한 기록」은 그대로 있다(읽을 때의 요약).
- [ ] 왼쪽 영역에 「안 쓴 기록」이 있다. 기록 제목과 이유가 보이고, 문장을 고른
      상태에서 누르면 그 문장에 붙는다.
- [ ] 왼쪽 영역 바닥에 「이 레시피로 생성하기」(40px 주 행동)가 있다. 누르면
      `confirm` 편집이 저장되고 `/brew/:id/generate`로 간다.
- [ ] 에스프레소 색은 고른 문장의 왼쪽 선과 배경 · 중심 근거 카드 · 주 행동에만 있다.

계약과 백엔드
- [ ] `RecipeV2EditSchema`에 `confirm`과 `restore`가 더해진다. `restore`는
      `{ title, intent, sections }`를 받아 그 상태로 되돌린다. 기존 연산은 그대로다.
- [ ] `confirm`은 `status`를 `confirmed`로, 그 뒤의 다른 편집 · 순서 변경은 `draft`로
      되돌린다.
- [ ] `restore`는 섹션 · 문장 · 근거를 지우고 받은 것으로 다시 넣되 **id를 유지**한다.
      낙관적 잠금(`editVersion`)은 그대로 적용된다.
- [ ] 백엔드 단위 · 통합 테스트가 `confirm`과 `restore`를 덮는다.

## 설계

**토큰 층** — `tokens.css`에 간격 · 반경 · 조작 높이를 더한다. 이름은
`--ex-space-N` · `--ex-radius-*` · `--ex-control-*`. 값의 출처는 design-ops
`profiles/measured/web-comfortable.DESIGN.md`(spacing · rounded · components.button
40px). 다른 화면은 옮기지 않는다.

**저장 상태 표시** — `components/shell/SaveState.tsx`(client)에 `SaveStateProvider` ·
`useSaveState` · `SaveStateIndicator`를 둔다. `WizardHeader`가 고정 글자 대신
`<SaveStateIndicator />`를 그리고, 제공자가 없으면 지금처럼 "자동 저장됨"을 보인다.
`BrewFrame`이 제공자를 감싸고 `Workbench`가 상태를 올린다.

**고르기** — `Setup.tsx`를 두 칸으로 재배치한다. 표는 `record-table.module.css`를
그대로 쓴다. 요약 칸은 새 `SetupSummary`(같은 파일 안 함수 컴포넌트)다. 분류별 분포
막대는 정의서 01b의 「고른 재료 n건」 카드 그대로다.

**고치기 상태 관리** — `Workbench.tsx`의 `run`을 `useRecipeEditor` 훅(`recipe-editor.ts`)
으로 옮긴다. 훅이 가진 것: `recipe`, `apply(edit)`, `reorder(sections)`, `undo`,
`redo`, `saveState`. 안에 (1) 낙관적 반영용 순수 리듀서 `applyLocally(recipe, edit)`,
(2) 직렬 저장 큐, (3) `past` · `future` 스냅샷 스택. 실행 취소는 `restore` 편집으로
보낸다. 서버 결과가 오면 그 판으로 바꾼다(id가 필요한 연산).

**드래그 앤 드롭** — `@dnd-kit/core` 6.3 · `@dnd-kit/sortable` 10.0 ·
`@dnd-kit/utilities`(react ≥16.8 peer, 2026-09-15 npm 확인). 섹션 `SortableContext`
하나, 문장은 섹션마다 `SortableContext`를 두고 `onDragOver`에서 컨테이너 사이 이동을
화면 상태에 반영, `onDragEnd`에서 `reorder` 한 번. 손잡이(`useSortable`의
`listeners`)만 끌린다 — 글 입력 칸은 끌리지 않는다.

**공고 요건 글** — `page.tsx`가 `recipe.jobPosting`이 있으면 `jobs.posting`을 읽어
`criteria.map(({id,label}))`를 `Workbench`에 넘긴다. 못 읽어도 화면은 선다(지금
Waiting과 같은 처리).

**백엔드** — `recipe-v2-service.ts#apply`에 `confirm` · `restore` 분기. `restore`는
한 트랜잭션 안에서 `recipeElementSources` → `recipeElements` → `recipeSections`를
지우고 받은 순서로 다시 넣는다. `reorder`와 다른 편집의 끝에 `status: "draft"`를 쓴다.

## 버린 대안

- 서버 판(revision) 기반 실행 취소 — `reorder`가 판을 남기지 않고, 판은 50개까지만
  남는다. 응답 계약도 바꿔야 한다. 클라이언트 스냅샷 + `restore`가 더 작다.
- 세 영역 작업대(§7.3 오른쪽 인스펙터) — 사용자가 두 영역 유지를 골랐다.
- 근거를 문장마다 늘 보이기 — 이전 커밋이 읽기 흐름을 위해 섹션 끝으로 옮겼다.
  고른 문장에서만 펼친다.
- 포인터 이벤트로 DnD 직접 구현 — 접근성(키보드 센서) · 자동 스크롤 · 충돌 판정을
  다시 짓는 일이다. dnd-kit이 그걸 들고 있다.
- 03 자리 표시 화면 — `/generate`는 별도 작업이다. 지금은 `not-found`가 받는다.

## 함정

- `reorder`는 **모든 섹션과 문장**을 빠짐없이 보내야 한다(서버 409). 화면 상태에서
  만들 때 빈 섹션도 넣는다.
- `editVersion` 낙관적 잠금 — 저장 요청이 겹치면 409다. 큐로 직렬화한다.
- `AutoTextarea`는 값이 밖에서 바뀌면 `useLayoutEffect`로 다시 맞춘다. 낙관적 반영과
  서버 판 교체가 잦아지므로 초점이 있는 칸은 덮어쓰지 않는다(지금 규칙 유지).
- dnd-kit `DndContext`는 client 컴포넌트다. `Workbench`는 이미 client다.
- `restore`가 id를 유지하므로 서버 `orderNo` 유일 인덱스 때문에 지우고 넣는 순서를
  지킨다(지우기 전부 → 넣기).
- `/brew/:id/generate`는 없다. CTA를 누르면 `not-found.tsx`가 뜬다 — intent에서
  정한 경계이며 보고에 적는다.
- Setup의 표는 `label`이 행이라 안에 버튼을 두면 체크가 같이 눌린다. 행 안 조작은
  두지 않는다.

## 완료 기준

```
pnpm --filter @expresso/contracts build && pnpm --filter @expresso/database build
pnpm typecheck
pnpm --filter @expresso/contracts test
pnpm --filter @expresso/backend test
pnpm test:infra            # recipe-v2 통합 테스트에 confirm · restore
```

브라우저(브랜치 서버 3103 · 1440×940, 1024×768, 390×844)에서
- 고르기: 두 칸 / 한 칸, 공고 유무에 따른 「순위 이유」 칸, 다시 짜기 확인 단계.
- 고치기: 카드 위계, 도구 상시 노출, 섹션 · 문장 드래그 후 새로고침 유지, 메뉴로
  섹션 간 이동, ⌘Z 두 번 · ⇧⌘Z 한 번 뒤 새로고침 유지, 저장 상태 표시, 근거
  중심 · 보조 · 요건 문장, 안 쓴 기록에서 붙이기, 「이 레시피로 생성하기」 뒤
  `status: confirmed`(API로 확인).
- 대비: 두 화면의 글자 색 짝을 다시 계산해 4.5:1 이상.

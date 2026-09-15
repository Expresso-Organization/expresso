---
title: 레시피 세 영역 — 내용 고르기 · 문장 종류 · 보여주는 형식
slug: recipe-content-and-format
stage: spec
status: accepted
intent: .intent/intent_recipe-content-and-format.md
date: 2026-09-15
---

# 레시피 세 영역 — 명세

## 요구사항

계약
- [ ] `RecipeV2Section`에 `role`(hero · profile · research · experience · projects ·
      contact · other, 기본 other)과 `presentation`(§7.9 어휘의 enum, nullable)이 있다.
- [ ] `PRESENTATIONS_BY_ROLE`이 계약에 있다 — 역할마다 고를 수 있는 형식 목록. 웹과
      플래너가 같은 표를 본다. 형식 enum 값마다 한국어 이름이 `PRESENTATION_LABEL`에 있다.
- [ ] `RecipeV2Item`에 `kind`(point · metric · media · link, 기본 point)와 `metric`
      (label · value · unit · note) · `media`(assetId nullable · caption · frame) · `link`
      (label · url)가 nullable로 있다. `kind`에 맞는 것만 채워진다(refine).
- [ ] 편집 연산이 더해진다 — `update_item_content`(kind와 값 전부), `update_section`에
      `role` · `presentation` 선택 필드, `add_section`에 `role` 선택 필드. `restore`가
      새 필드를 실어 나른다. 기존 연산의 모양은 그대로다.
- [ ] 플래너 초안(`RecipeDraftItemSchema`)에 `kind` · `metric` · `link` · `caption`이
      선택으로 있고, 섹션에 `role` · `presentation`이 선택으로 있다. 없으면 기본값이라
      기존 픽스처가 그대로 통과한다.
- [ ] 미디어 목록 응답 스키마(`MediaAssetListResponseSchema`)가 계약에 있다.

저장
- [ ] 마이그레이션 0009 `recipe_content_kinds` — `recipe_sections`에 `role` ·
      `presentation`, `recipe_elements`에 `kind` · `metric` · `media` · `link`,
      `recipe_items`(v1)에 `content` 검증기 항목. 기존 문서는 손대지 않는다.
- [ ] v2 서비스가 새 필드를 읽고 쓴다. v1 초안을 옮길 때 `context.contentPattern`을
      역할 · 형식으로, `recipe_items.content`를 종류 · 값으로 옮긴다.
- [ ] 통합 테스트 — 종류 바꾸기 · 형식 고르기 · `restore` 왕복 · v1 이관이 새 필드를
      지킨다.

플래너
- [ ] 프롬프트가 종류(수치 · 미디어 자리 · 링크)와 역할 · 형식을 제안하게 한다. 수치는
      재료에 있는 값만 쓴다. v1 저장이 `content`와 `context.role/presentation`을 남긴다.

고치기 화면
- [ ] 세 영역이다 — 왼쪽 `--ex-rail-width`, 가운데 유동, 오른쪽 `--ex-editor-panel-width`.
      1024px 미만에서는 양쪽이 서랍이다.
- [ ] 왼쪽은 기록 · 미디어 · 요건 세 탭. 항목마다 쓴 곳(섹션 번호)이 보이고 안 쓴 것은
      그렇게 표시된다. 문장을 고른 상태에서 기록 · 요건을 누르면 그 문장의 근거가 된다.
      미디어를 누르면 고른 문장이 `media`면 그 그림이 되고, 아니면 그 문장 다음에 새
      `media` 문장이 생긴다. 미디어 탭에 올리기가 있다(기존 모듈).
- [ ] 목차는 가운데 위의 접이식 줄이다. 섹션 번호 · 이름 · 역할이 한 줄에 선다.
- [ ] 섹션 카드 머리에 역할 고르기와, 형식이 정해졌으면 작은 와이어프레임이 선다.
      카드를 누르면 그 섹션이 고른 섹션이다(문장을 고르면 그 섹션도 고른 것이다).
- [ ] 오른쪽은 고른 섹션의 역할에 맞는 형식 목록이다. 형식 하나는 파란 박스
      와이어프레임(`Wireframe` 컴포넌트, 형식마다 그림 하나)이고 `--ex-motion-panel`로
      등장 · 배치 애니메이션이 돈다. `prefers-reduced-motion`이면 멈춘 그림이다. 누르면
      `update_section presentation`. 고른 것은 파란 테두리다. 고른 섹션이 없으면
      "섹션을 고르면 형식이 보입니다"뿐이다.
- [ ] 문장 줄의 「⋯」 메뉴에 종류 바꾸기가 있다. 종류마다 그 줄에 맞는 칸이 열린다 —
      수치: 라벨 · 값 · 단위 · 설명 / 링크: 라벨 · URL / 미디어: 그림(없으면 빈 액자
      버튼 → 왼쪽 미디어 탭 열림) · 설명 · 액자(그대로 · 브라우저 창 · 폰).
- [ ] 되돌리기 · 낙관적 반영 · DnD는 새 필드를 지킨다(`applyLocally`에 분기 추가).

고르기 화면
- [ ] 요약 카드 아래 「미디어」 카드 — 올리기와 최근 올린 것 격자.

문서
- [ ] 기획서 §7 머리 정정 문단에 2026-09-15 되돌림을 적고 §20에 한 줄 더한다.

## 설계

**계약** — `recipe-v2.ts`에 `RecipeV2SectionRoleSchema` · `RecipeV2PresentationSchema` ·
`PRESENTATIONS_BY_ROLE` · `PRESENTATION_LABEL` · `RecipeV2ItemKindSchema` · 값 스키마
셋. 문장은 평평한 모양(`kind` + nullable 값 셋)이다 — 판별 합집합보다 리듀서와
저장이 단순하고 옛 판이 그대로 읽힌다. §7.9 어휘를 kebab-case id로 적고 한국어
이름은 표에 둔다(예: `big-statement` → 큰 문장).

**저장** — `RecipeElementDoc`에 `kind?` · `metric?` · `media?` · `link?`,
`RecipeSectionDoc`에 `role?` · `presentation?`, `RecipeItemDoc`에 `content?`.
0006의 `extendValidator`를 0009에서 다시 쓴다(복사가 아니라 0006에서 export).

**서비스** — `#load`가 기본값을 채우고, `#apply`에 `update_item_content` 분기와
`update_section`의 두 필드, `#restore`와 `#adopt`가 새 필드를 옮긴다.

**플래너** — `RecipeDraftItemSchema`에 선택 필드, `SYSTEM`에 종류 · 역할 · 형식 절.
`MongoRecipeService.generate`가 `recipe_items.content`와 `context.role/presentation`을
쓴다. 결정적 플래너(폴백)는 role만 넣는다.

**웹 · 편집기 훅** — `applyLocally`에 `update_item_content` 분기. `update_section`
패치에 role · presentation. 나머지는 그대로.

**웹 · Workbench** — `panes`를 세 칸으로. 왼쪽 `SourceRail`(탭 · 목록 · 올리기),
오른쪽 `FormatPanel`(역할별 형식 목록), `Wireframe`(형식 id → 파란 박스 SVG + CSS
keyframes)은 `recipe/` 아래 새 파일. 카드 머리에 `<select>` 역할과 미니 와이어프레임.
문장 줄은 `kind`별 분기(`MetricFields` · `MediaFields` · `LinkFields`).

**웹 · 미디어** — `endpoints.ts`에 `media.list`. `recipe-actions.ts`에
`uploadMediaAction(formData)`(04의 `addMediaAction` 앞 절반과 같다). `MediaUploader`는
`MediaDrop`에서 올리기 부분만 떼어 공용 컴포넌트 `components/ui/MediaUploader.tsx`로
두고 04와 02가 함께 쓴다.

**토큰** — `--ex-preview` · `--ex-preview-soft` · `--ex-preview-ink`(밝은 · 어두운 지면
두 벌). 형식 미리보기에만 쓴다고 주석에 적는다.

## 버린 대안

- 문장을 판별 합집합으로 — 리듀서 · 저장 · 스트리밍 파서가 모두 갈라진다. 평평한 모양이 작다.
- 형식 후보를 디자인 시스템이 제한(§7.8) — intent 범위 밖.
- 와이어프레임을 실제 디자인의 컴포넌트로 렌더 — 03이 없고, 형식은 디자인과 무관하게
  고른다. 추상 박스가 맞다.
- 미디어를 기록에 붙이기 — 기록 문서와 커리어 화면까지 번진다. 라이브러리 단위로 둔다.

## 함정

- `restore`는 문장의 모든 값을 실어야 한다. 새 필드를 빼먹으면 되돌릴 때 종류가 사라진다.
- `reorder`는 문장 id만 옮기므로 영향 없다.
- 스트리밍 파서(`partialRecipeSections`)는 `pointText`만 읽는다. 초안 항목에 `kind`가
  와도 무시하면 된다 — 기다리는 화면은 글만 보인다.
- 미디어 목록은 60개까지다(`media.service.list`). 그 이상은 이번에 다루지 않는다.
- 왼쪽 서랍과 오른쪽 서랍이 같은 스크림을 쓴다. 둘 다 열리는 상태는 없다.
- 0006과 main의 0006 충돌은 merge 때 푼다. 0009는 main의 0008 뒤다.

## 완료 기준

```
pnpm --filter @expresso/contracts build && pnpm --filter @expresso/database build
pnpm db:migrate
pnpm typecheck
pnpm test
pnpm test:infra
```

브라우저(3103 · 1440×940 · 1024×768 · 390×844)
- 세 영역 · 서랍. 탭 셋과 쓴 곳 표시. 문장을 고르고 기록 · 요건 · 미디어를 눌러 붙이기.
- 섹션을 고르면 오른쪽에 형식 와이어프레임이 돌고, 누르면 카드 머리에 작게 선다.
  새로고침 뒤 유지. ⌘Z로 되돌림.
- 「⋯」에서 종류를 수치 · 링크 · 미디어로 바꾸고 값을 넣는다. 새로고침 뒤 유지.
- 고르기의 「미디어」 카드에서 올리기.
- 대비: 새 파란 토큰 위 글자 4.5:1, 박스 3:1 이상.

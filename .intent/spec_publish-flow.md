---
title: 편집에서 배포 · 재배포 · 공개 중단까지 이어지는 배포 흐름
slug: publish-flow
stage: spec
status: accepted
date: 2026-11-20
---

# Spec — 배포 흐름

## 공개 상태

`lib/publish-state.ts`에 `publishState(portfolio)`를 둔다. 편집 화면과 배포 화면이 같은 판정을 쓴다.

| 상태 | 조건 | 상태 머리 문구 | 편집 화면 버튼 |
|---|---|---|---|
| `draft` | `deployment === null` | 아직 배포 전 | 배포하기 |
| `changed` | `status === "published"` · `hasUnpublishedChanges` | 공개 중 · vN · 고친 내용이 아직 안 나갔습니다 | 다시 배포 |
| `live` | `status === "published"` · 변경 없음 | 공개 중 · vN | 배포 관리 |
| `unlisted` | `status !== "published"` · `deployment !== null` | 공개 중단 · vN | 다시 공개 |

편집 화면 상단 상태 표시(`statusPill`)도 이 판정으로 문구를 고른다. 문구는 지금과 같다.

## 배포 화면 구조

`page.tsx`(서버)는 데이터와 사전 확인만 만든다. 헤더 버튼과 본문이 같은 동작 상태를 봐야 하므로 `DocumentHeader`와 `AppBody`를 `DeployPanel`(클라이언트)이 그린다. 클라이언트 부품이 `DocumentHeader`를 그리는 선례는 `CareerBrowser`다.

- **상태 머리**(`StatusHead`): 본문 맨 위 카드. 상태 문구, 공개 주소(`publicSiteHost`), 「열기」(`publicSiteUrl`, 새 탭, `rel="noreferrer"`), 「복사」(`navigator.clipboard.writeText(publicSiteUrl)` → 2초 동안 「복사함」, 실패하면 「복사하지 못했습니다」). `unlisted`이면 「열기」 대신 「다시 공개」. `draft`이면 주소 대신 "배포하면 주소가 생깁니다".
- **주소 입력 줄의 「열어 보기」**는 지운다. 여는 길은 상태 머리 하나다.
- **헤더 배포 버튼**: `v{nextVersion} 배포`. 진행 중이면 `disabled`, 문구 「배포하는 중」. 지면이 없으면(`canPublish === false`) `disabled`.
- **판 목록**: 현재 판이 `unlisted`면 「공개 중단됨」 표시 옆에 「다시 공개」. 지난 판의 「되돌리기」와 아래 「공개 중단」은 확인 창을 연다.

## 확인 창

확인 창은 `DeployPanel` 안에 하나 두고, 띄운 일(공개 중단 · 되돌리기)에 따라 글과 단추를 바꾼다. 공용 `@/components/ui/dialog`를 쓴다(어느 화면에서나 가운데 뜨도록 이미 고쳐져 있다).

- 공개 중단 — 제목 "공개를 중단할까요?", 본문 "{주소}가 바로 닫힙니다. 문서와 배포 기록은 그대로 남고, 언제든 같은 판으로 다시 공개할 수 있습니다.", 버튼 「공개 중단」(위험 색).
- 되돌리기 — 제목 "v{N} 판으로 되돌릴까요?"(판 번호에 조사를 붙이지 않는다), 본문 "방문자는 바로 v{N}을 보게 됩니다. 지금 공개 중인 판은 목록에 남고, 편집 중인 내용은 바뀌지 않습니다.", 버튼 「되돌리기」.
- 확인을 누르면 창을 닫고 동작을 보낸다. 결과는 기존 알림 줄이 보인다.

## 동작

`deployAction`에 `intent=reopen`을 더한다. `deploymentId`(현재 판)로 `publishing.rollback`을 부르고 `{ reopened: { version, slug } }`를 돌려준다. 알림: "다시 공개했습니다 — v{N} · {주소 링크}". 배포 알림도 주소를 링크로 보인다.

## 편집 화면

`Editor.tsx`의 상단 배포 링크 문구를 `publishState`로 고른다. 링크 대상(`/edit/{id}/deploy`)은 그대로다.

## 테스트

- `publish-state.test.ts`: 네 상태 판정과 버튼 문구.
- `DeployPanel.test.tsx`(`deploy-actions` 모의):
  - 공개 중단을 누르면 창이 뜨고, 확인 전에는 동작이 불리지 않는다. 확인하면 `intent=unpublish`로 불린다.
  - `unlisted`면 「다시 공개」가 보이고 `intent=reopen`과 현재 판 id로 불린다.
  - 지면이 없으면 헤더 배포 버튼이 비활성이다.
  - 상태 머리의 「열기」가 공개 주소(`publicSiteUrl`)를 가리킨다.

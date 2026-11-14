---
title: 설정 프로필에서 표시 이름 변경
slug: profile-name-change
stage: plan
status: accepted
intent: .intent/intent_profile-name-change.md
spec: .intent/spec_profile-name-change.md
date: 2026-11-10
---

# 설정 프로필에서 표시 이름 변경 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `packages/contracts/src/identity.ts` | `DisplayNameSchema` 추출, `SignupSchema`가 사용, `UpdateProfileSchema`·`UpdateProfile` 추가 |
| `packages/contracts/src/contracts.test.ts` | `UpdateProfileSchema` 검사 추가 |
| `packages/contracts/src/openapi.ts` | `/me` 경로 목록이 있으면 `PATCH` 추가 (없으면 변경 없음) |
| `services/backend/src/modules/identity/service.ts` | `updateDisplayName` 추가 |
| `services/backend/src/modules/identity/legacy-mysql-service.ts` | `updateDisplayName` 지원하지 않음 스텁 |
| `services/backend/src/modules/identity/routes.ts` | `PATCH /v1/me` 추가 |
| `services/backend/src/modules/identity/auth.integration.test.ts` | 이름 변경 통합 테스트 추가 |
| `services/web/src/lib/api/endpoints.ts` | `auth.updateProfile` 추가 |
| `services/web/src/app/account-actions.ts` | `updateDisplayNameAction` 추가 |
| `services/web/src/app/(app)/account/DisplayNameForm.tsx` | 새로 만듦. 보기·편집 상태 |
| `services/web/src/app/(app)/account/page.tsx` | 표시 이름 줄에 폼 연결(대신 로그인 중에는 글자만) |
| `services/web/src/app/(app)/account/page.module.css` | 입력칸 스타일 (기존 `--ex-*` 토큰만) |

구현 중 이 표에서 벗어나면 같은 커밋에서 이 파일을 고친다.

## 작업 순서

1. **계약** — `DisplayNameSchema`·`UpdateProfileSchema` 추가, 계약 테스트 작성. 확인: `pnpm --filter @expresso/contracts test`.
2. **백엔드** — 서비스 메서드, 레거시 스텁, `PATCH /v1/me`, 통합 테스트. 확인: `pnpm --filter @expresso/backend typecheck`와 인프라를 띄운 `pnpm test:infra`의 identity 파일.
3. **웹 연결** — 엔드포인트, 서버 액션. 확인: `pnpm --filter @expresso/web typecheck`.
4. **웹 화면** — `DisplayNameForm`, `page.tsx` 연결, CSS. 확인: 개발 서버에서 `/account#profile`로 저장 · 거절 · 취소 · 사이드바 반영 · 새로고침 유지를 직접 조작해 본다.
5. **전체 검증** — 아래 검증 명령.
6. **커밋 · 푸시** — 계약+백엔드, 웹을 `feat:` 두 커밋으로 올린다.

## 가장 위험한 단계

4단계. 서버 액션 뒤 사이드바가 옛 이름으로 남는 경우(`requireSession`이 요청 단위 `cache()`라 `revalidatePath("/", "layout")`가 빠지면 생긴다)와, 대신 로그인 중 폼이 노출되는 경우가 있다. 둘 다 화면에서 직접 확인한다. 되돌리기는 웹 커밋 하나를 되돌리면 되고, 백엔드 API는 쓰이지 않는 상태로 남아도 해가 없다. DB 스키마는 바뀌지 않으므로 마이그레이션 되돌림은 없다.

## 검증

```bash
pnpm infra:up
pnpm typecheck
pnpm test
pnpm test:infra
```

UI: `DEV_LOGIN=1`로 `/account#profile`을 열고 — 이름 바꾸기 → 저장 → 줄과 사이드바 확인 → 새로고침 → 빈 값 저장(거절) → 취소. 관리자로 더미 계정을 대신 보는 화면에서는 「이름 바꾸기」가 없는지 확인한다.

## 자기 점검

- 깨질 수 있는 것: `SignupSchema`가 `DisplayNameSchema`를 쓰도록 바꾸는 부분. 규칙이 같아 동작은 같고, 가입 계약 테스트가 지킨다.
- `IdentityApi`가 레거시 타입에서 파생되므로 스텁을 빠뜨리면 백엔드 타입 검사가 깨진다. 2단계 확인에 걸린다.
- 버린 대안(별도 경로 · 별도 페이지 · 대신 로그인 중 허용)은 spec과 같다.

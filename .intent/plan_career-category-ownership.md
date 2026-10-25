---
title: 커리어 카테고리 사용자 소유화와 레거시 태그 이관
slug: career-category-ownership
stage: plan
status: accepted
intent: .intent/intent_career-category-ownership.md
spec: .intent/spec_career-category-ownership.md
date: 2026-10-25
---

# 커리어 카테고리 사용자 소유화와 레거시 태그 이관 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `packages/contracts/src/career.ts` · `openapi.ts` · 테스트 | v1 정의 · `tags` · `isSystem` · v1 뷰 스키마 삭제, `propertySchemaV2` 필수, 생성 요청은 v2 정의 |
| `packages/database/src/career-category-templates.ts`(새) · `index.ts` · `documents/career.ts` | 템플릿 7종과 결정적 ID, 문서 타입 정리 |
| `packages/database/src/mongodb-migrations/0017/`(새) · `mongo-migrations.ts` · `mongo-build.mjs` · 테스트 | 이관 마이그레이션과 등록 |
| `services/backend/src/modules/identity/service.ts` | 가입 트랜잭션에서 템플릿 카테고리 생성 |
| `services/backend/src/modules/career/*` | v1 경로 · v1 API · `legacy-mysql-service.ts` 삭제, 소유자 조회, 옵션 `configure`, 기록 글 읽기 함수, 역량 옵션 쓰기 |
| `career-computation` · `career-editor/ai-proposals.ts` | v2 정의만 읽기, 소유자 조회 |
| `jobs` · `job-analysis` · `materials` · `interview` · `agent-chat` | 이름으로 푼 기록 글, 인터뷰 기록의 사용자 경험 카테고리, 정리는 제목 · 역량만 |
| `services/web/src/app/(app)/career/[categorySlug]/page.tsx` | `fallbackView` v1 변환 삭제 |
| `services/web/src/features/career-editor/**` | v1 변환 · `isSystem` 잠금 삭제, 옵션 추가 UI(문서 패널 · 표 셀) |
| `services/web/e2e/career-editor.spec.ts` · 각 테스트 고정값 | v2 생성 요청, `isSystem` 제거, 옵션 추가 시나리오 |
| `scripts/operations/career-ownership-snapshot.mjs`(새) | 이관 전후 사용자별 수 · 매칭 점수 스냅샷 |

구현 중 이 표에서 벗어나면 같은 커밋에서 이 파일을 고친다.

## 작업 순서

1. 계약 변경 후 `pnpm typecheck`로 사용처를 모두 찾는다.
2. 템플릿 · 0017 · database 테스트 — 레거시 형태 고정값으로 이관 결과(카테고리 7개, 태그 → 옵션, 수 보존, 재실행 무해)를 확인한다.
3. 서버 career 모듈 · 가입 · 소비 모듈 — 백엔드 typecheck와 단위 · 통합 테스트.
4. 웹 — v1 변환 삭제와 옵션 추가, 웹 단위 테스트.
5. 체험 DB를 사본으로 복원 → 스냅샷 → 0017 → 스냅샷 비교 → 사본에 붙인 서버로 화면 확인.
6. 전체 검증, 커밋, 원격 `feat/career-category-ownership`에 푸시(fetch 뒤 fast-forward만, 강제 푸시 금지), PR(base `feat/career-editor-v2-default`).

## 가장 위험한 단계

0017 사용자별 이관. 기록이나 보기가 옛 카테고리 ID를 계속 가리키면 화면에서 사라진다. 사용자마다 트랜잭션 하나로 묶고, 공용 문서 삭제 전에 "공용 카테고리를 가리키는 기록 · 보기 0건"을 확인하지 못하면 단계를 실패시킨다. 되돌리기는 이관 전 덤프 복원이다. 운영 배포 전에 `mongodump`를 받으라고 PR에 적는다.

## 검증

```
pnpm typecheck
pnpm test
pnpm test:infra
pnpm --filter @expresso/web exec playwright test
node scripts/operations/career-ownership-snapshot.mjs <db> > before.json   # 사본에서 0017 전후
```

화면: 사본 DB에 붙인 이 워크트리 API · 웹에서 dev01로 `/career/project` → "개인 가계부 PWA" 문서 패널의 기술 칩 확인 → 새 기술 추가 → 새로 고침 뒤 유지. 새 계정으로 프로젝트에 속성을 추가하고 dev01 화면에 없는지 확인.

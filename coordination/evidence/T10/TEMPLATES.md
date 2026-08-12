# T10 템플릿 렌더링 계약 증거

- 상태: verified
- 일자: 2026-08-09 (Asia/Seoul)
- 체크리스트: M4-01

## 구현 결과

- Clarity, Signal, Editorial 템플릿과 renderer version/style/tone/industry 메타데이터를 seed했다.
- 모든 활성 템플릿은 `*` section contract를 가져 임의 레시피 섹션을 순서·제목 그대로 렌더한다.
- preview content는 실제 recipe item만 사용하며 비어 있는 섹션을 dummy text 없이 `empty`로 보존한다.
- 기업 tone/industry 일치로 추천 템플릿을 표시하고 pro 템플릿도 선택 가능한 상태로 반환한다.
- 기업 palette를 적용할 때 WCAG 상대 휘도 대비를 계산하고 본문 4.5:1 미만이면 black/white 중 높은 대비로 자동 보정한다.
- 새로 생성되는 legacy/test template도 유효한 wildcard/style 기본값을 갖도록 후속 backfill/default migration을 적용했다.

## 검증 결과

| 검사 | 결과 |
|---|---|
| migrations 0012–0013 PGlite/Compose PostgreSQL 적용 | PASS |
| black/white 21:1, 저대비 자동 보정 unit | PASS — 1 test |
| 모든 DB template × 임의/빈 section conformance | PASS — 1 test |
| 실제 내용 보존 / Lorem dummy 부정 assertion | PASS |
| outbox shared-DB 격리 경쟁 수정·전용 DB 회귀 | PASS |
| contracts | PASS — 13 tests |
| database | PASS — 11 tests |
| backend | PASS — 26 files, 54 tests |
| 전체 `pnpm test` | PASS — 78 tests |
| 전체 `pnpm typecheck` / `pnpm build` | PASS |
| `git diff --check` | PASS |

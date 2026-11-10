---
title: 개발 포털 첫 화면 패치노트와 서버 자동 갱신
slug: portal-patch-notes
stage: spec
status: accepted
intent: .intent/intent_portal-patch-notes.md
date: 2026-11-10
---

# 개발 포털 첫 화면 패치노트와 서버 자동 갱신 — 명세

## 요구사항

- [ ] 포털 `NAV` 맨 앞에 `패치노트` 탭이 있고, 해시가 없을 때 · 로고(`goHome`) · `#/patch-notes`가 이 탭을 연다.
- [ ] 패치노트 화면은 `./data/patch-notes.json`만 읽고, zod 스키마(`shared/patch-notes.ts`)로 검사한다. 형식이 틀리면 오류를 보이고 멈춘다.
- [ ] 화면은 KST 날짜 내림차순, 날짜 안에서 `mergedAt` 내림차순, 사용자 변경 먼저 · `개발 · 운영` 묶음 나중이다.
- [ ] 생성기는 정리본(`patch-notes/seed.json`)과 이전 결과의 PR 번호에 없는, 기간 안(2026-11-02 ~ 2026-12-01 KST)에 머지된 PR만 새로 쓴다.
- [ ] 생성기는 Claude Code 출력을 `--json-schema` 없이 받는다. 문법이 깨지면 같은 대화(`--resume`)에 고쳐 달라고 하고, 칸이 틀리면 그 칸만 다시 받는다. 진전이 없으면 그 PR을 `pending`에 남기고 다음 실행에서 다시 시도한다.
- [ ] 결과는 임시 파일에 쓴 뒤 이름을 바꾼다. 잠금 파일로 겹쳐 실행되지 않는다.
- [ ] 생성기 단위 테스트(`node --test`)가 기간 판정 · 대상 PR 고르기 · 출력 추출과 검사 · 칸 단위 고침 병합을 확인한다.

## 설계

**재사용** — 진행 현황 앱(`services/dev-portal/status`)을 그대로 쓴다.
- 화면: Vite 두 번째 입력 `patch-notes.html` → 빌드 결과 `docs/status/patch-notes.html`. 같은 `index.css`(제품 `tokens.css`), `usePortalTheme`, shadcn `Badge` · `Separator` · `Skeleton` · `Alert`를 쓴다.
- 데이터 경로: 생성기가 `/var/lib/expresso-status/patch-notes.json`에 쓰면 기존 nginx `location ~ ^/status/data/([a-z-]+\.json)$`가 그대로 내보낸다. nginx 변경 없음(주석만 고침).
- AI 호출: 서버에 로그인된 `claude` CLI(`CLAUDE_CLI_PATH`), 모델은 스캐너와 같은 `sonnet`. 스캐너의 `agent.ts`는 `--json-schema`를 쓰므로 가져오지 않고, 같은 인자 묶음(도구 없음 · MCP 없음 · 예산 상한)으로 새 호출부를 쓴다.
- PR 조회: 스캐너처럼 서버의 `gh`.

**새로 만드는 것**
- `shared/patch-notes.ts`: `PatchNoteEntry`(`id` · `date` · `mergedAt` · `kind: user|dev` · `title` · `details[]` · `prs[]`), `PatchNotes`(`generatedAt` · `period` · `entries` · `pending`), `Draft`(AI가 쓰는 세 칸 `kind` · `title` · `details`).
- `patch-notes/main.ts`: 인자 `--out` · `--dry-run` · `--limit`. 정리본 + 이전 결과 병합, 대상 PR 고르기, 항목 생성, 원자적 쓰기.
- `patch-notes/writer.ts`: 프롬프트, CLI 호출, `extractDraft`(본문에서 JSON 꺼내 `Draft` 검사), `repairDraft` 루프.
- `patch-notes/seed.json`: 11/02–11/10 정리본 51개 변경을 이 형식으로 옮긴 것.
- 포털: `PATCH_TAB = '패치노트'`, `PATCH_PAGE`, `parseRoute` · `routeOf` · 초기 상태 · `goHome` · `headerLabel` · 전역 검색 바로가기 · `<iframe>` 한 줄.
- 서버: `infra/server/expresso-patch-notes.sh`(전용 클론 `~/expresso-patch-notes`를 `origin/main`으로 맞추고 실행), `infra/systemd/expresso-patch-notes.{service,timer}`(15분, oneshot).

## 버린 대안

- 포털 `.dc.html` 안에 직접 그리기: 포털은 인라인 스타일 템플릿이라 제품 토큰 · 테마를 다시 짜야 한다. 진행 현황 앱이 이미 그 문제를 풀었다.
- 새 nginx `location` + 새 결과 폴더: 공용 서버 nginx를 바꿀 이유가 없다. 기존 정규식이 `patch-notes.json`을 받는다.
- 진행 현황 스캔 스크립트에 이어 붙이기: 스캔은 최대 3시간 걸리는 oneshot이라 패치노트가 그만큼 늦어진다.
- GitHub Actions에서 생성: 러너에는 Claude 로그인이 없고 결과를 서버로 옮기는 길을 새로 내야 한다.

## 함정

- `gh` 검색의 `merged:` 날짜는 UTC다. 넉넉히 받아 KST로 다시 거른다.
- 정리본 항목은 PR 여러 개를 묶는다. "이미 쓴 PR"은 항목의 `prs`를 모두 펼쳐 판정한다.
- 포털 iframe은 `index.html` 캐시 문제 때문에 `?v=` 를 붙인다(`statusSrc`와 같게).
- 빌드는 `docs/status/assets/`를 지우고 다시 쓴다. 두 페이지의 자산이 함께 커밋되어야 한다.

## 완료 기준

```
cd services/dev-portal/status && pnpm test && pnpm typecheck && pnpm build
node patch-notes/main.ts --out ../../../docs/status/data --dry-run   # 새로 쓸 PR 목록 출력
```
`python3 scripts/serve-docs.py`로 포털을 열어 첫 화면이 패치노트이고 테마 전환이 따라오는지 본다. 머지 뒤 서버에서 타이머 첫 실행 결과가 `https://dev.expresso.ai.kr/status/data/patch-notes.json`에 나온다.

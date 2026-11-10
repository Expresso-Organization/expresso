---
title: 개발 포털 첫 화면 패치노트와 서버 자동 갱신
slug: portal-patch-notes
stage: plan
status: accepted
intent: .intent/intent_portal-patch-notes.md
spec: .intent/spec_portal-patch-notes.md
date: 2026-11-10
---

# 개발 포털 첫 화면 패치노트와 서버 자동 갱신 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `services/dev-portal/status/shared/patch-notes.ts` (새) | 항목 · 결과 · 초안 zod 스키마, KST 날짜 함수 |
| `services/dev-portal/status/patch-notes/seed.json` (새) | 11/02–11/10 정리본 |
| `services/dev-portal/status/patch-notes/config.json` (새) | 기간 · 모델 · 예산 · 시간 상한 |
| `services/dev-portal/status/patch-notes/writer.ts` (새) | 프롬프트 · CLI 호출 · 추출 · 칸 단위 고침 |
| `services/dev-portal/status/patch-notes/main.ts` (새) | 병합 · 대상 고르기 · 생성 · 쓰기 · 잠금 |
| `services/dev-portal/status/patch-notes/*.test.ts` (새) | 단위 테스트 |
| `services/dev-portal/status/patch-notes.html` · `src/patch-notes/*` (새) | 화면 입력과 컴포넌트 |
| `services/dev-portal/status/vite.config.ts` · `package.json` · `tsconfig.scanner.json` | 두 번째 입력 · test 경로 · 타입 검사 범위 |
| `docs/status/*` | 빌드 결과 |
| `docs/Expresso 개발 포털.dc.html` | 「패치노트」 탭 · 첫 화면 |
| `docs/index.html` · `docs/patch-notes-2026-11-10.html`(삭제) | 목록 줄을 포털 탭으로, 정적 문서 제거 |
| `infra/server/expresso-patch-notes.sh` · `infra/systemd/expresso-patch-notes.{service,timer}` (새) | 서버 실행 |
| `infra/nginx/dev.expresso.ai.kr.conf` | 결과 파일 이름 주석만 |
| `docs/operations/ORACLE_HOSTING.md` · `services/dev-portal/README.md` | 운영 절 · 앱 설명 |

## 작업 순서

1. 스키마와 정리본 — `seed.json`이 `PatchNotes.entries` 스키마를 통과하는 테스트.
2. 생성기(`writer.ts` · `main.ts`)와 테스트 — `pnpm test` 통과, `--dry-run`이 정리본에 없는 PR(#222 등)만 나열.
3. 로컬에서 한 건 실제 생성 — `--limit 1`로 Claude가 쓴 항목이 형식을 지키는지 눈으로 본다.
4. 화면 — `pnpm dev`로 `patch-notes.html` 확인 후 `pnpm build`.
5. 포털 탭 — `serve-docs.py`로 첫 화면 · 로고 · `#/patch-notes` · 테마 확인.
6. 정적 문서 제거, 목록 줄 교체.
7. 서버 스크립트 · 유닛 · 운영 문서.
8. 커밋 · PR. 머지 뒤 서버 설치(사용자 확인 후) — 운영 문서 「처음 한 번」대로.

## 가장 위험한 단계

8단계 서버 설치. 공용 기계에 유닛을 올리고 Claude 사용량을 쓴다. nginx는 건드리지 않으므로 다른 서비스에 닿는 변경은 없다. 되돌리기는 `sudo systemctl disable --now expresso-patch-notes.timer`와 `/var/lib/expresso-status/patch-notes.json` 삭제다. 그다음 위험은 5단계로, 포털 첫 화면 상태를 바꾸다 다른 탭 라우팅을 깨뜨릴 수 있다 — 탭마다 주소로 들어가 본다.

## 검증

```
cd services/dev-portal/status
pnpm test
pnpm typecheck
pnpm build
node patch-notes/main.ts --out ../../../docs/status/data --dry-run
node patch-notes/main.ts --out ../../../docs/status/data --limit 1
cd ../../.. && python3 scripts/serve-docs.py 8791
```

화면: `/docs/Expresso%20개발%20포털.dc.html`을 열어 첫 화면 → 「진행 현황」 → 로고 → `#/patch-notes` 순으로 이동하고, 테마를 어둡게 바꿔 본다. 휴대폰 폭에서 가로 스크롤이 없는지 본다.

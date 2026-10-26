# 개발 포털 — 만들 때 쓴 원본 자료

**포털 문서 자체는 여기 없습니다.** 저장소 뿌리의 `docs/` 가 원본이고,
<https://dev.expresso.ai.kr> 로 나갑니다.

전에는 문서가 세 벌이었습니다 — 별도 저장소(`Expresso-Organization/dev-portal`),
여기 있던 사본, 그리고 `docs/`. 셋이 갈라진 채 각자 늙었고, 배포는 둘 다
멈춰 있었습니다(2026-08-20에 정리). 남은 것은 `docs/` 하나입니다.

여기 남은 것은 문서를 만들 때 쓴 자료라 `docs/` 로 옮기지 않았습니다 —
`docs/` 는 그대로 공개되는 폴더입니다.

| 무엇 | 어디 |
|---|---|
| `source/scraps/` | 화면 구성을 잡을 때 쓴 스케치와 개요 |
| `source/uploads/` | 문서에 붙였다 뺀 그림 |
| `server/README.md` | 포털 저장 백엔드를 붙인다면 어디에 붙일지 |
| `status/` | 포털 「진행 현황」 탭의 대시보드 원본 — 아래 절 |

호스팅과 배포는 `docs/operations/ORACLE_HOSTING.md` 7절에 있습니다.

## 진행 현황 대시보드 (`status/`)

포털의 「진행 현황」 탭(`#/status`)은 `status/`의 React · shadcn 앱입니다. 포털 발행에는
빌드 단계가 없으므로 **빌드 결과를 `docs/status/`에 커밋합니다.**

| 무엇 | 어디 |
|---|---|
| 판정 데이터 | `docs/status/status.json` — 화면은 이 파일 하나만 읽습니다 |
| 빌드 결과 | `docs/status/index.html` · `docs/status/assets/` |
| 기준일 · 커밋 · 열린 PR 갱신 | `node scripts/status/refresh-status.mjs` |

```bash
cd services/dev-portal/status
pnpm install        # 이 폴더는 독립 pnpm 루트입니다 — 루트 잠금 파일을 건드리지 않습니다
pnpm dev            # 로컬 확인. ./status.json 은 docs/status/ 에서 읽습니다
pnpm build          # docs/status/ 에 결과를 씁니다
```

- **판정만 바꿀 때는 빌드하지 않습니다.** `status.json`을 고쳐 커밋하면 됩니다.
- 화면을 고쳤으면 `pnpm build` 결과(`docs/status/index.html` · `assets/`)도 함께 커밋합니다.
- 독립 루트로 둔 이유: 루트 `pnpm-lock.yaml`이 바뀌면 `main` 머지 때 운영 웹 배포가 함께 돕니다.
- 색 · 글꼴은 `services/web/src/styles/tokens.css`를 직접 가져오고, shadcn 변수는 그 역할 토큰에
  대응만 합니다(`status/src/index.css`). 테마는 포털 설정(`expresso_portal_theme_v1`)을 따릅니다.

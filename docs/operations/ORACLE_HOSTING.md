# Oracle 서버 호스팅 준비

작성일 2026-08-13 · 대상 `Oracle-Server`(`ubuntu@140.245.74.246`)

개발을 서버에서 이어 가기 위한 준비 기록이다. **아직 아무것도 올리지 않았다** —
서버는 읽기만 했고, 이 문서와 `infra/compose.server.yaml`,
`services/backend/.env.server.example`이 준비물의 전부다.

## 1. 서버 실측 (2026-08-13)

| 항목 | 값 |
|---|---|
| CPU · 메모리 | 4 vCPU · 23GB(여유 8.7GB) |
| 아키텍처 | **aarch64** (Ampere) — 로컬 Mac(arm64)과 같다 |
| OS | Ubuntu 22.04.5 LTS |
| 디스크 | 194GB 중 **9.3GB 남음(96% 사용)** |
| Docker | 27.2.1 · 컨테이너 28개 가동 중 |
| Node | nvm에 18 · 20 · 22. **24 없음**(이 저장소는 `>=24` 요구) |
| 앞단 | 호스트 nginx가 80/443 점유, certbot으로 `*.lawdigest.kr` 다수 서비스 중 |

이 기계는 **공용이다.** lawdigest · aris · synapsenote · SWE-bench 평가
컨테이너가 함께 돈다. 그래서 준비물은 전부 "남의 것과 안 겹치게"를 전제로 짰다.

### 디스크가 가장 큰 제약

`/home/ubuntu`가 136GB를 쓰고 있다(`project` 62GB · `research` 17GB).
Docker 이미지에 회수 가능한 5GB가 있지만 **다른 프로젝트의 이미지라 함부로
지우지 않는다.** Expresso가 새로 쓸 것은 대략 이렇다.

- postgres:18.4 + redis:8.2 이미지 — 약 0.5GB
- 저장소 + `node_modules` — 약 2GB
- 업로드 미디어 · DB 데이터 — 쓰는 만큼

9.3GB로 시작할 수는 있지만 여유가 없다. **올리기 전에 정리 여부를 정해야 한다.**

## 2. 포트 배정 (2026-08-13 기준 전부 비어 있음)

전부 `127.0.0.1`에만 묶는다. 바깥에는 nginx만 나간다.

| 무엇 | 포트 |
|---|---|
| API | 4500 |
| 웹 | 3500 |
| PostgreSQL | 55432 |
| Redis | 56379 |

## 3. 아직 정하지 않은 것

### AI 프로바이더 — 이게 정해져야 흐름이 돈다

서버의 `~/.local/bin/claude`(v2.1.208)와 `~/.codex/auth.json`은 있지만
**둘 다 OAuth가 만료됐다**(`Failed to authenticate: OAuth session expired`).
그리고 어댑터는 로그인된 CLI를 `spawn`하는 방식이다.

세 갈래다.

1. **서버에서 CLI 재로그인** — 사람이 대화형으로 붙어야 한다. 가장 빠르지만
   토큰이 또 만료되면 같은 자리에서 멈춘다.
2. **`anthropic` API 어댑터 구현** — `platform/ai/create-client.ts`에 자리만
   있고 *"아직 없다 — 운영에 올리기 전에 채운다"*로 남아 있다. 서버에는 이쪽이
   정공법이다. API 키가 필요하다.
3. **AI 없이 먼저 올린다** — 화면·목록·공고 수집까지는 돌지만 요건 추출과
   문장 생성은 `EXTRACTOR_UNAVAILABLE` · `WRITER_UNAVAILABLE`로 멈춘다.
   규칙으로 흉내 내는 폴백은 제품에서 걷어냈다.

### 도메인

nginx가 이미 `*.lawdigest.kr`을 여럿 서비스한다. `expresso.lawdigest.kr` 같은
서브도메인을 붙일지, 당분간 SSH 터널로만 볼지 정해야 한다.

### 실행 방식

이 저장소에는 Dockerfile이 없다. 서버가 로컬과 같은 arm64라 이미지를 만들 수도
있지만, **개발을 이어 가는 것이 목적**이라면 `git pull` → 빌드 → systemd 3개
(api · worker · web)가 단순하다.

## 4. 준비물

- `infra/compose.server.yaml` — 전용 Postgres · Redis. 포트는 루프백에만 열고
  비밀번호는 `.env`에서 받는다.
- `services/backend/.env.server.example` — 서버용 환경 예시. 서명 키와 소금은
  `openssl rand -hex 32`로 채운다.

## 5. 올릴 때 밟을 순서

```bash
# 1. Node 24 (aarch64 공식 빌드가 있다)
ssh Oracle-Server 'bash -lc "nvm install 24 && node -v"'

# 2. 코드
ssh Oracle-Server 'git clone <repo> ~/expresso && cd ~/expresso && npm i -g pnpm@11 && pnpm install'

# 3. 인프라
scp infra/compose.server.yaml Oracle-Server:~/expresso/infra/
ssh Oracle-Server 'cd ~/expresso && EXPRESSO_POSTGRES_PASSWORD=... docker compose -f infra/compose.server.yaml up -d --wait'

# 4. 스키마
ssh Oracle-Server 'cd ~/expresso && pnpm db:migrate'

# 5. 기동 (systemd 유닛은 아직 안 만들었다)
```

5번의 유닛 파일은 위 "아직 정하지 않은 것"이 정해진 뒤에 쓴다 — 실행 방식과
AI 프로바이더에 따라 내용이 달라진다.

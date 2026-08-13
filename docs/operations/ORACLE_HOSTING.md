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
| 디스크 | 194GB 중 **67GB 남음**(2026-08-13 사용자가 정리) |
| Docker | 27.2.1 · 컨테이너 28개 가동 중 |
| Node | nvm에 18 · 20 · 22 · **24.13.1**. pnpm 11.16.0을 24에 붙여 뒀다 |
| 앞단 | 호스트 nginx가 80/443 점유, certbot으로 `*.lawdigest.kr` 다수 서비스 중 |

이 기계는 **공용이다.** lawdigest · aris · synapsenote · SWE-bench 평가
컨테이너가 함께 돈다. 그래서 준비물은 전부 "남의 것과 안 겹치게"를 전제로 짰다.

### 런타임은 24에 고정하되 기계의 기본값은 건드리지 않는다

`nvm alias default`는 **22로 둔다.** 이 기계의 다른 프로젝트가 그 값을 보고
돌기 때문이다. Expresso는 절대 경로로 24를 가리킨다.

```
/home/ubuntu/.nvm/versions/node/v24.13.1/bin/node
/home/ubuntu/.nvm/versions/node/v24.13.1/bin/pnpm   # 11.16.0, corepack로 붙임
```

systemd 유닛도 이 경로를 그대로 쓴다 — 셸을 거치지 않으므로 `nvm use`에
기대면 안 된다. 저장소의 `.nvmrc`(24)는 사람이 붙어 작업할 때를 위한 것이다.

### 우분투는 올릴 필요가 없다

Node 24 리눅스 빌드는 glibc 2.28 이상을 요구하고 이 기계는 **2.35**다
(Ubuntu 22.04.5). 확인했고 `node -v`가 `v24.13.1`을 낸다.

굳이 올려야 할 일이 생기면 `sudo do-release-upgrade`지만, 컨테이너 28개가
도는 기계라 권하지 않는다. 올릴 이유가 생기면 그때 따로 판단한다.

## 2. 포트 배정 (2026-08-13 기준 전부 비어 있음)

전부 `127.0.0.1`에만 묶는다. 바깥에는 nginx만 나간다.

| 무엇 | 포트 |
|---|---|
| API | 4500 |
| 웹 | 3500 |
| PostgreSQL | 55432 |
| Redis | 56379 |

## 3. 아직 정하지 않은 것

### 실행 방식

이 저장소에는 Dockerfile이 없다. 서버가 로컬과 같은 arm64라 이미지를 만들 수도
있지만, **개발을 이어 가는 것이 목적**이라면 `git pull` → 빌드 → systemd 3개
(api · worker · web)가 단순하다.

## 4. 정해진 것

### AI — `claude-code`로 간다 (2026-08-13 확인)

서버의 `~/.local/bin/claude`(v2.1.208)가 다시 로그인되어 **응답한다**. 그래서
서버 환경은 이렇게 둔다.

```
AI_PROVIDER=claude-code
CLAUDE_CLI_PATH=/home/ubuntu/.local/bin/claude
```

토큰이 만료되면 계약이 `AI_UNAVAILABLE`로 죽고 `ai.call_failed` 로그에 사유가
남는다. 그때는 다시 로그인하거나 API 어댑터(`create-client.ts`의 빈 자리)를
채운다.

### 도메인 — `expresso.ai.kr` (인증서 발급 완료)

DNS가 이미 이 서버를 가리키고 있었다. 인증서는 Let's Encrypt로 받았다
(만료 2026-11-11, 기존 vhost들과 같은 webroot 방식).

앞단 구성은 `infra/nginx/expresso.ai.kr.conf`에 그대로 있다. 서버에 놓인
사본은 `/etc/nginx/sites-available/expresso.ai.kr`이다.

| 경로 | 어디로 |
|---|---|
| `/v1/` | API `127.0.0.1:4500` — 배포된 지면이 그림을 `/v1/media/<id>`로 부른다 |
| `/` | 웹 `127.0.0.1:3500` |

지금은 앱이 없어 **502가 정상이다.**

#### 이 기계의 nginx는 systemd가 아니다

`nginx.service`는 `inactive`인데 80/443은 다른 마스터(`nginx -c
/etc/nginx/nginx.conf`, PID 552610)가 쥐고 있고 `/run/nginx.pid`가 비어 있다.
그래서 `systemctl reload nginx`도 `nginx -s reload`도 듣지 않는다. 리로드는
마스터에 직접 신호를 보낸다.

```bash
sudo kill -HUP "$(pgrep -f 'nginx: master process nginx -c')"
```

**이것이 인증서 갱신에도 걸린다.** `/etc/letsencrypt/renewal-hooks/deploy/00-reload-nginx.sh`가
`systemctl reload nginx`를 부르고 실패한다(발급할 때 실제로 실패했다). 갱신은
되지만 **nginx가 새 인증서를 집어 들지 않는다** — 이 기계의 모든 도메인이 같은
상태다. 훅을 고칠지는 다른 서비스에도 영향이 있어 따로 정한다.

### 올린 결과 (2026-08-13)

세 프로세스가 systemd로 돈다. Node 24를 절대 경로로 가리킨다 — 유닛은 셸을
거치지 않으므로 `nvm use`에 기댈 수 없다.

| 유닛 | 무엇 | 로그 |
|---|---|---|
| `expresso-api` | `dist/api/main.js` · 4500 | `~/expresso/log/api.log` |
| `expresso-worker` | `dist/worker/main.js` | `~/expresso/log/worker.log` |
| `expresso-web` | `next start --port 3500` | `~/expresso/log/web.log` |

코드는 서버의 bare 저장소(`~/expresso.git`)를 거쳐 들어간다. 다음 배포부터는
로컬에서 `git push oracle <브랜치>` 뒤 서버에서 pull·빌드·재시작이면 된다.

종단 확인 — 가입 → 공고 제출 → **요건 6개 추출까지 서버에서 돌았다.**

#### 계약 타임아웃을 600초로 올렸다

첫 시도가 어댑터 기본값 180초를 넘겨 버려지고 2차에서 성공했다. 이 기계에서
opus 호출이 그보다 오래 걸린다는 뜻이라 `AI_TIMEOUT_MS=600000`을 준다. 재시도로
덮으면 사용자는 3분을 더 기다리고 호출은 두 번 나간다.

이걸 찾을 수 있었던 것은 어제 붙인 실패 로그 덕이다 — `queue.job_failed`가
`AiError` / `AI_TIMEOUT`을 그대로 남겼다.

## 5. 준비물

- `infra/compose.server.yaml` — 전용 Postgres · Redis. 포트는 루프백에만 열고
  비밀번호는 `.env`에서 받는다.
- `services/backend/.env.server.example` — 서버용 환경 예시. 서명 키와 소금은
  `openssl rand -hex 32`로 채운다.
- `infra/nginx/expresso.ai.kr.conf` — 앞단 vhost. 서버 사본과 같은 내용이다.

## 6. 올릴 때 밟을 순서

```bash
# 1. 런타임 — 끝났다. v24.13.1 + pnpm 11.16.0이 붙어 있다.
ssh Oracle-Server '~/.nvm/versions/node/v24.13.1/bin/node -v'

# 2. 코드
ssh Oracle-Server 'git clone <repo> ~/expresso'
ssh Oracle-Server 'cd ~/expresso && ~/.nvm/versions/node/v24.13.1/bin/pnpm install'

# 3. 인프라
scp infra/compose.server.yaml Oracle-Server:~/expresso/infra/
ssh Oracle-Server 'cd ~/expresso && EXPRESSO_POSTGRES_PASSWORD=... docker compose -f infra/compose.server.yaml up -d --wait'

# 4. 스키마
ssh Oracle-Server 'cd ~/expresso && ~/.nvm/versions/node/v24.13.1/bin/pnpm db:migrate'

# 5. 기동 (systemd 유닛은 아직 안 만들었다)
```

마지막 유닛 파일은 위 "아직 정하지 않은 것"이 정해진 뒤에 쓴다 — 실행 방식과
AI 프로바이더에 따라 내용이 달라진다.

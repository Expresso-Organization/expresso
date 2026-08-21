# Oracle 서버 호스팅 준비

작성일 2026-08-13 · 대상 `Oracle-Server`(`ubuntu@140.245.74.246`)

개발을 서버에서 이어 가기 위한 기록이다. **2026-08-13에 올렸고 지금 돌고 있다** —
<https://expresso.ai.kr>가 그것이다. 1~4절은 그때 실측하고 정한 것이고,
5·6절이 지금 쓰는 배포 절차다.

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
| MySQL | 53306 |
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
sudo kill -HUP "$(pgrep -f '^nginx: master process nginx -c')"
```

**앵커(`^`)를 빼면 듣지 않는다.** 이 기계에는 컨테이너의 nginx 마스터가 셋 더
있고, `pgrep -f`는 그 명령을 담은 자기 자신의 셸까지 물어 온다. PID가 여럿
나오면 `kill`이 인자를 못 읽고 실패한다(2026-08-20에 겪었다).

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

저장소는 **<https://github.com/Expresso-Organization/expresso>** 다(public).
서버의 `~/expresso`도 여기서 직접 당긴다 — 예전에 쓰던 `~/expresso.git`(로컬
bare)은 더 이상 경로에 없다.

- `infra/compose.server.yaml` — 전용 MySQL · Redis. 포트는 루프백에만 열고
  비밀번호는 `.env`에서 받는다.
- `services/backend/.env.server.example` — 서버용 환경 예시. 서명 키와 소금은
  `openssl rand -hex 32`로 채운다.
- `infra/nginx/expresso.ai.kr.conf` — 앞단 vhost. 서버 사본과 같은 내용이다.
- `infra/systemd/expresso-{api,worker,web}.service` — 세 유닛. Node 24를 절대
  경로로 부른다.

## 6. 배포

평소에는 세 줄이다. **빌드 대상과 재시작 대상을 짝지어야 한다** — 어긋나면
옛 코드가 도는 채로 "배포했다"고 믿게 된다.

```bash
# 1. 올린다
git push origin <branch>

# 2. 서버가 당기고 빌드한다 (웹을 고쳤을 때)
ssh Oracle-Server 'cd ~/expresso && git pull -q && \
  PATH=$HOME/.nvm/versions/node/v24.13.1/bin:$PATH pnpm --filter @expresso/web build'

# 3. 짝이 맞는 유닛만 재시작한다
ssh Oracle-Server 'sudo systemctl restart expresso-web'
```

| 고친 곳 | 빌드 | 재시작 |
|---|---|---|
| `services/web` | `--filter @expresso/web` | `expresso-web` |
| `services/backend` | `--filter @expresso/backend` | `expresso-api expresso-worker` |
| `packages/contracts` · `packages/database` | `-r` (전부) | 셋 다 |
| `packages/database/migrations` | — | `pnpm db:migrate` 먼저 |

### 처음 한 번 (빈 기계에 올릴 때)

```bash
# 런타임 — nvm default는 22로 두고 24를 절대 경로로 쓴다
ssh Oracle-Server '~/.nvm/versions/node/v24.13.1/bin/node -v'

ssh Oracle-Server 'git clone https://github.com/Expresso-Organization/expresso.git ~/expresso'
ssh Oracle-Server 'cd ~/expresso && ~/.nvm/versions/node/v24.13.1/bin/pnpm install'

# 인프라 — 비밀번호는 셸 이력에 남지 않게 넣는다
ssh Oracle-Server 'cd ~/expresso && EXPRESSO_MYSQL_PASSWORD=... docker compose -f infra/compose.server.yaml up -d --wait'

# 스키마
ssh Oracle-Server 'cd ~/expresso && ~/.nvm/versions/node/v24.13.1/bin/pnpm db:migrate'

# 환경과 유닛
ssh Oracle-Server 'cp ~/expresso/services/backend/.env.server.example ~/expresso/services/backend/.env'   # 값을 채운다
ssh Oracle-Server 'sudo cp ~/expresso/infra/systemd/*.service /etc/systemd/system/ && sudo systemctl daemon-reload'
ssh Oracle-Server 'sudo systemctl enable --now expresso-api expresso-worker expresso-web'
```

앞단 nginx는 이 기계에서 **systemd가 아니다** — 4절 「이 기계의 nginx는
systemd가 아니다」를 보라. vhost를 넣은 뒤에는 `sudo nginx -t`로 검사하고 그 절의
`kill -HUP`으로 올린다.

## 7. 개발 포털 — `dev.expresso.ai.kr` (2026-08-20)

문서를 브라우저로 돌려 보려고 매번 `scripts/serve-docs.py`를 띄우지 않도록 같은
기계에 정적으로 올렸다. 제품(`expresso.ai.kr`)과 달리 앱이 없다 — HTML과 그 옆의
스크립트뿐이라 nginx가 파일을 그대로 내보낸다. 프록시도 업스트림도 빌드도 없다.

| 항목 | 값 |
|---|---|
| 주소 | <https://dev.expresso.ai.kr> |
| DNS | 이미 `140.245.74.246`을 가리키고 있었다 — 레코드를 새로 만들지 않았다 |
| 인증서 | Let's Encrypt · 만료 **2026-11-18** · 기존 도메인들과 같은 webroot 방식 |
| vhost | `infra/nginx/dev.expresso.ai.kr.conf` — 서버 사본은 `/etc/nginx/sites-available/dev.expresso.ai.kr` |
| 웹루트 | `/var/www/dev.expresso.ai.kr` |
| 원본 | 저장소 루트의 `docs/` |

### 웹루트를 따로 두는 이유

작업 트리(`~/expresso/docs`)를 직접 가리키지 않는다. 호스트 nginx가 `www-data`로
도는데 `/home/ubuntu`가 `700`이라 그 밑을 읽지 못한다. 홈 권한을 여는 것은 이
기계가 공용이라 하지 않는다. 옮겨 놓으면 서버에서 브랜치를 바꿔도 공개된 문서가
함께 바뀌지 않는 이점도 따라온다.

### 공개 범위

인증을 걸지 않았다. 대신 `docs/robots.txt`(`Disallow: /`)와 `X-Robots-Tag:
noindex, nofollow` 헤더로 색인을 막는다. 저장소가 public이라 이 문서들은 이미
GitHub에서 읽히므로 새로 드러나는 것은 없다. 인증이 필요해지면 `htpasswd`와
`auth_basic` 두 줄이면 된다.

### 배포 — `docs/`를 푸시하면 올라간다

`.github/workflows/dev-portal-oracle.yml`이 `main`과 `flow/**`의 `docs/` 변경을
보고 있다. **밀어 넣지 않고 서버가 당긴다** — 러너는 커밋 해시 하나만 건네고,
서버가 그 해시를 GitHub에서 받아 발행한다. 무엇이 올라갔는지가 해시로 남는다.

**커밋·푸시하기 전까지는 보이지 않는다.** 웹루트는 하나뿐이라 뒤에 온 푸시가
이긴다.

액션이 막혔을 때와 올라간 것을 확인할 때만 손으로 부른다.

```bash
scripts/deploy-dev-portal.sh              # 지금 브랜치의 HEAD
scripts/deploy-dev-portal.sh <커밋|브랜치>  # 지정한 것
```

#### 포털용 클론을 따로 둔다

발행은 `~/expresso-dev-portal`에서 한다. **제품이 도는 `~/expresso`가 아니다** —
거기서 브랜치를 오가면 돌고 있는 API·웹이 함께 흔들린다.

#### 배포 키로는 셸이 열리지 않는다

이 기계는 남의 서비스가 함께 도는 공용이라 CI에 셸을 주지 않는다. 서버의
`~/.ssh/authorized_keys`가 그 키를 `command=`로 묶어 스크립트 하나만 실행한다.

```
command="/usr/local/bin/expresso-dev-portal-deploy",no-agent-forwarding,no-port-forwarding,no-X11-forwarding,no-user-rc,no-pty ssh-ed25519 AAAA… expresso-dev-portal-ci
```

스크립트 원본은 `infra/server/expresso-dev-portal-deploy.sh`다. 요청한 명령은
`SSH_ORIGINAL_COMMAND`로 들어오고, 거기서 **커밋 해시만** 받는다. 해시가 아니면
아무것도 하지 않는다 — 바깥에서 온 문자열을 셸에 그대로 넘기지 않기 위해서다.

#### 시크릿 한 개가 필요하다

개인키는 저장소 시크릿 `ORACLE_DEV_PORTAL_KEY`에 넣는다. 키는 이 배포에만 쓰는
전용 ed25519이고, 사람이 쓰는 키와 별개다.

```bash
gh secret set ORACLE_DEV_PORTAL_KEY \
  --repo Expresso-Organization/expresso < ~/.ssh/expresso-dev-portal-ci
```

호스트 키는 시크릿이 아니라 지문이라 워크플로에 그대로 박아 두었다. 서버를 다시
만들면 그 줄도 바꾼다(`ssh-keyscan -t ed25519 140.245.74.246`).

### nginx 리로드는 4절의 그 문제를 그대로 겪는다

`systemctl reload nginx`도 `nginx -s reload`도 듣지 않는다. 마스터에 직접
신호를 보낸다. `pgrep -f "nginx: master"`는 **컨테이너의 마스터 셋과 자기
자신까지 물어 온다** — 앵커를 붙여 호스트 것만 고른다.

```bash
sudo kill -HUP "$(pgrep -f '^nginx: master process nginx -c')"
```

인증서를 받을 때 `deploy-hook`이 `nginx.service is not active`로 실패한 것도
같은 원인이고, 이 기계의 모든 도메인이 같은 상태다. 발급 자체는 되었다.

### 문서를 한 벌로 모았다 (2026-08-20)

같은 문서가 세 벌이었다. 셋이 갈라진 채 각자 늙었고, 배포는 둘 다 멈춰 있었다.

| 어디 | 마지막 갱신 | 배포 |
|---|---|---|
| `Expresso-Organization/dev-portal`(별도 저장소) | 2026-08-06 | Cloudflare Pages — 최근 3회 실행 전부 실패 |
| `services/dev-portal/docs/`(모노레포 안 사본) | 2026-08-07 | 같은 Pages 프로젝트 — 한 번도 실행되지 않음 |
| `docs/` | 계속 | dev.expresso.ai.kr |

`docs/`만 남겼다. 사본과 `.github/workflows/dev-portal-deploy.yml`을 지우고,
별도 저장소는 읽기 전용으로 돌렸다(지우지는 않았다 — 그 이력이 유일한 곳이다).

`services/dev-portal/`에는 문서를 만들 때 쓴 자료(`source/`)만 남는다. `docs/`는
그대로 공개되는 폴더라 거기로 옮기지 않았다.

**`expresso-dev-portal.pages.dev`는 아직 살아 있고 8월 6일 문서를 보여 준다.**
이제 아무도 갱신하지 않으므로 Pages 프로젝트를 지우는 편이 낫지만, 그 주소를
아는 사람이 있을 수 있어 따로 정한다.

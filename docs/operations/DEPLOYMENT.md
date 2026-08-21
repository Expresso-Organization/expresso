# expresso.ai.kr 배포 runbook

Oracle Cloud 인스턴스 한 대에 API · Worker · 웹을 함께 올리고, nginx가 앞에서
`expresso.ai.kr` 하나로 묶는다.

> **지금 서버에 올라가 있는 구성이다.** nginx 설정과 systemd 유닛은 저장소
> `infra/` 아래 파일이 그대로 깔려 있다(2026-08-20 대조, 세 유닛과 nginx 모두
> 한 글자도 다르지 않다). 문서가 사본을 또 들고 있으면 둘이 갈라지므로, 고칠
> 때는 `infra/`의 파일을 고치고 서버에 다시 깐다.

## 구성 요소

| 프로세스 | 명령 | 포트 | 비고 |
|---|---|---|---|
| API | `node dist/api/main.js` | 4500 | `HOST=127.0.0.1` |
| Worker | `node dist/worker/main.js` | 없음 | 큐 소비 · 매일 아침 수집 |
| 웹 | `next start --port 3500` | 3500 | Next.js 16 · `HOSTNAME=127.0.0.1` |
| MySQL | `infra/compose.yaml` | 53306 | 컨테이너 |
| Redis | `infra/compose.yaml` | 56379 | 컨테이너 |

바깥으로 열리는 포트는 443(과 80→443 전환)뿐이다. 나머지 넷은 모두
`127.0.0.1`에만 묶는다.

저장소는 `/home/ubuntu/expresso`에 있고 세 유닛 모두 `ubuntu` 사용자로 돈다.
node는 nvm이 깐 `v24.13.1`을 **절대 경로로** 부른다. nvm의 `default` 별칭은
22라서, 배포 스크립트가 `nvm.sh`를 읽어 오면 서비스와 다른 node로 짓게 된다.

## 배포 전에 반드시 아는 것

이 셋을 모르면 배포는 성공한 것처럼 보이고 화면만 깨진다.

### 1. `NEXT_PUBLIC_API_BASE_URL`은 빌드 시점에 박힌다

`NEXT_PUBLIC_*`은 `next build`가 도는 환경의 값을 자바스크립트 번들에 **문자열로
치환해 넣는다**. `next start` 앞에 붙여도 이미 늦다.

```bash
# 맞다 — 빌드에 값이 들어간다
NEXT_PUBLIC_API_BASE_URL=https://expresso.ai.kr pnpm --filter @expresso/web build

# 틀리다 — 번들에는 기본값 http://127.0.0.1:4500 이 박힌 뒤다
pnpm --filter @expresso/web build
NEXT_PUBLIC_API_BASE_URL=https://expresso.ai.kr pnpm --filter @expresso/web start
```

### 2. 그 값은 **브라우저**가 닿는 주소여야 한다

화면 코드는 서버에서만 API를 부르지만(`"use client"` 파일 중 `lib/api`를 쓰는
것은 없다), 이미지 주소는 예외다.

```tsx
// components/portfolio/Media.tsx
src={mediaAssetUrl(API_BASE_URL, media.assetId, media.variants.at(-1))}
// → https://expresso.ai.kr/v1/media/{assetId}?w=1200
```

이 `<img src>`가 그대로 브라우저로 내려간다. `http://127.0.0.1:4500`을 넣으면
방문자 브라우저가 자기 컴퓨터의 4500번을 찾아가고 포트폴리오 이미지가 전부
깨진다. 그래서 **`https://expresso.ai.kr`을 넣고, nginx가 `/v1/`을 백엔드로
넘긴다.**

`GET /v1/media/:id`는 인증을 걸지 않은 공개 경로라 브라우저가 직접 받을 수 있다
(`services/backend/src/modules/media/routes.ts:60`).

### 3. 기본값 그대로 두면 안 되는 비밀 둘

`services/backend/src/config/runtime-config.ts`가 로컬용 기본값을 갖고 있어
**설정하지 않아도 서버가 뜬다.** 조용히 안전하지 않은 상태가 된다.

| 변수 | 코드의 기본값 | 그대로 두면 |
|---|---|---|
| `ASSET_SIGNING_SECRET` | `expresso-local-asset-signing-secret` | 비공개 에셋 URL 서명을 누구나 위조한다 |
| `ANALYTICS_VISITOR_SALT` | `expresso-local-analytics-salt` | 방문자 해시를 사전 계산으로 되돌릴 수 있다 |

```bash
openssl rand -base64 32   # 두 번 돌려 서로 다른 값을 쓴다
```

## 서버 준비 (최초 1회)

Node 24와 pnpm 11.16.0이 필요하다. Oracle 무료 인스턴스는 ARM(Ampere)인 경우가
많은데, `sharp`는 `linux-arm64` 프리빌트 바이너리가 있어 별도 빌드 도구가 필요
없다.

인스턴스에 이미 nvm이 있어 그것을 쓴다. 별도 배포 계정을 만들지 않고 `ubuntu`
사용자의 홈에 둔다.

```bash
# nvm 으로 24를 깐다. pnpm 은 corepack 이 packageManager 를 읽어 붙인다.
nvm install 24
corepack enable && corepack prepare pnpm@11.16.0 --activate

git clone https://github.com/Expresso-Organization/expresso.git ~/expresso
```

`nvm alias default`는 22로 두어도 된다. 서비스와 배포 스크립트가 `v24.13.1`을
절대 경로로 부르기 때문이다. 다만 **셋이 같은 자리를 가리켜야 한다** —
`infra/systemd/*.service`의 `ExecStart`, `scripts/operations/deploy.sh`의
`NODE_BIN`, 그리고 실제로 깔린 버전.

```bash
ls ~/.nvm/versions/node/          # v24.13.1 이 있는지
grep -h ExecStart ~/expresso/infra/systemd/*.service
grep NODE_BIN ~/expresso/scripts/operations/deploy.sh
```

MySQL과 Redis는 저장소의 compose 파일을 쓰되, **`pnpm infra:up`을 그대로
쓰지 않는다.**

`infra/compose.yaml`의 포트 게시는
`"53306:5432"` 형태라 도커가 **`0.0.0.0`에 묶는다.** 게다가 도커는 자기 규칙을
iptables에 직접 넣기 때문에 `ufw deny 53306`로 막아도 뚫린다. 로컬 개발용
비밀번호(`expresso:expresso`)가 그대로인 MySQL이 인터넷에 열린다는 뜻이다.

운영 서버에는 루프백에만 묶는 override 파일을 둔다.

```yaml
# infra/compose.override.yaml — 저장소에 넣지 않는다(서버에만 둔다)
services:
  mysql:
    ports: ["127.0.0.1:53306:3306"]
    environment:
      MYSQL_PASSWORD: <바꾼-비밀번호>
      MYSQL_ROOT_PASSWORD: <바꾼-비밀번호>
  redis:
    ports: ["127.0.0.1:56379:6379"]
```

`pnpm infra:up`은 `-f infra/compose.yaml`만 지정하므로 이 override를 합치지
않는다. 서버에서는 두 파일을 함께 지정해 올린다.

```bash
cd ~/expresso/infra
docker compose -f compose.yaml -f compose.override.yaml up -d --wait
docker compose ps --format '{{.Name}}\t{{.Ports}}'   # 127.0.0.1 로 시작하는지 확인
```

Oracle Cloud는 인스턴스 방화벽과 별개로 **VCN 보안 목록**이 있다. 거기서도
443(과 80)만 열려 있는지 확인한다.

## 환경 파일

`/home/ubuntu/expresso/services/backend/.env` — API와 Worker가 함께 읽고,
`pnpm db:migrate`도 이 파일을 읽는다.

```bash
NODE_ENV=production
HOST=127.0.0.1
PORT=4500
LOG_LEVEL=info

DATABASE_URL=mysql://expresso:<바꾼-비밀번호>@127.0.0.1:53306/expresso
REDIS_URL=redis://127.0.0.1:56379

ASSET_SIGNING_SECRET=<openssl rand -base64 32>
ANALYTICS_VISITOR_SALT=<openssl rand -base64 32 — 위와 다른 값>

MEDIA_PROVIDER=local
MEDIA_DIR=/home/ubuntu/expresso/var/media

# 키도 로그인도 없이 도는 기본값. 각 모듈의 규칙 기반 구현이 쓰인다.
# claude-code · codex는 이 머신에 로그인된 CLI를 부르는 개발 전용이고,
# anthropic은 아직 구현되지 않았다. 운영에서는 off로 둔다.
AI_PROVIDER=off

# 고용24 공공 API. 없으면 워크넷 어댑터를 아예 만들지 않는다.
# WORK24_API_KEY=
```

`MEDIA_DIR`은 프로세스의 작업 디렉터리 기준으로 해석되므로
(`platform/storage/local.ts`의 `resolve(root)`) **절대 경로로 적는다.**

```bash
mkdir -p ~/expresso/var/media
chmod 600 ~/expresso/services/backend/.env
```

웹은 `.env` 파일을 읽지 않는다. 빌드할 때 환경 변수로 넘긴다([함정 1](#1-next_public_api_base_url은-빌드-시점에-박힌다)).

## nginx

설정은 저장소에 있다 — `infra/nginx/expresso.ai.kr.conf`. 서버에 깔린 것과 같은
파일이므로 여기에 다시 옮겨 적지 않는다. 고칠 일이 있으면 그 파일을 고치고 다시
깐다.

```bash
sudo cp ~/expresso/infra/nginx/expresso.ai.kr.conf /etc/nginx/sites-available/expresso.ai.kr
sudo ln -sf /etc/nginx/sites-available/expresso.ai.kr /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

인증서는 certbot이 발급하고, 80번의 `/.well-known/acme-challenge/`가 그 갱신
경로다. 그래서 80번은 전부 301로 넘기지 않고 그 한 자리만 남겨 둔다.

```bash
sudo certbot --nginx -d expresso.ai.kr
```

읽을 때 눈여겨볼 두 가지.

- **`/v1/`만 API로 간다.** 배포된 지면이 그림을 `/v1/media/<id>`로 가리키고
  공개 포트폴리오도 같은 접두어를 쓴다. 브라우저가 직접 부르는 경로다.
- **`/v1/`의 `proxy_read_timeout`이 900초다.** 생성 계약은 모델을 기다린다.
  기본 60초로는 지면 한 장을 못 받는다.

지면 스트림(SSE)은 nginx 설정이 아니라 응답 헤더로 푼다 — 라우트가
`X-Accel-Buffering: no`를 실어 보내고 nginx가 그 응답만 버퍼링하지 않는다.
`services/backend/src/modules/page/stream-route.integration.test.ts`가 그 헤더가
빠지지 않았는지 지킨다.

## systemd

유닛 셋도 저장소에 있다 — `infra/systemd/expresso-{api,web,worker}.service`.
서버에 깔린 것과 같은 파일이다.

```bash
sudo cp ~/expresso/infra/systemd/expresso-*.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now expresso-api expresso-worker expresso-web
```

읽을 때 눈여겨볼 두 가지.

- **`ExecStart`가 node를 절대 경로로 부른다**
  (`/home/ubuntu/.nvm/versions/node/v24.13.1/bin/node`). systemd는 로그인 셸을
  거치지 않아 nvm이 PATH에 붙지 않는다. 버전을 올릴 때는 세 유닛과 `deploy.sh`의
  `NODE_BIN`을 함께 고친다.
- **웹은 `HOSTNAME=127.0.0.1`로 묶는다.** 이 값이 없으면 `next start`가
  `0.0.0.0`에 붙어 3500번이 인터넷에 그대로 열린다. nginx를 우회해 들어올 수
  있다.

Worker와 API는 `WorkingDirectory`가 같다 — `AI_FIXTURE_DIR` 같은 상대 경로가 이
기준이다.

## sudo 권한

배포 스크립트가 서비스를 재시작하고 실패하면 journald를 읽는다. 지금은 `ubuntu`가
`sudo` 그룹에 있어 비밀번호 없이 둘 다 된다.

```bash
sudo -n systemctl is-active expresso-api    # 되물음 없이 답하면 통과
```

**이 상태는 필요한 것보다 넓다.** 배포 키가 새면 그대로 루트가 된다. 좁히려면
전용 계정을 만들고 재시작 셋만 여는 편이 낫다.

```
# /etc/sudoers.d/expresso — 계정을 나눌 때
<배포계정> ALL=(root) NOPASSWD: /usr/bin/systemctl restart expresso-api, \
                               /usr/bin/systemctl restart expresso-worker, \
                               /usr/bin/systemctl restart expresso-web
```

계정을 나누면 `infra/systemd/*.service`의 `User=`와 `WorkingDirectory=`,
`deploy.sh`의 `ROOT`·`NODE_BIN`이 함께 바뀐다.

## 배포 절차

손으로 하든 CI가 하든 **같은 스크립트 하나**를 쓴다. 두 경로가 갈리면 "CI에서는
되는데 손으로는 안 되는" 상태가 생긴다.

```bash
ssh ubuntu@expresso.ai.kr
cd ~/expresso

scripts/operations/deploy.sh            # origin/main 최신으로
scripts/operations/deploy.sh <커밋>     # 특정 커밋으로
```

스크립트가 `origin/main`을 직접 받아 오므로 앞에서 `git fetch`를 따로 하지
않는다. node 자리도 스크립트가 PATH에 붙이므로 nvm을 미리 읽을 필요가 없다.

스크립트가 하는 일은 이 순서다. 어느 단계든 실패하면 거기서 멈춘다.

1. 현재 커밋을 `.last-deployed-commit`에 적어 둔다 — 롤백이 이 파일 하나만 본다.
2. 대상 커밋으로 `git checkout --detach` 한 뒤 `pnpm install --frozen-lockfile`.
3. `@expresso/contracts` → `@expresso/database` 순으로 빌드한다. 웹과 백엔드가
   계약의 타입을 그대로 쓰기 때문에 순서를 바꾸면 깨진다.
4. `pnpm db:migrate` — `services/backend/.env`를 읽는다.
5. 백엔드를 빌드하고, 웹은 `NEXT_PUBLIC_API_BASE_URL`을 준 채로 빌드한다
   ([함정 1](#1-next_public_api_base_url은-빌드-시점에-박힌다)).
6. Worker → API 순으로 재시작하고 4500번의 `/health/ready`가 200을 낼 때까지
   기다린다.
   큐 소비자를 먼저 올려야 새 스키마의 작업을 받을 수 있다.
7. 웹을 재시작하고 3500번이 200을 낼 때까지 기다린다.
8. 바깥에서 본 `https://expresso.ai.kr/login`과 `/home`을 확인한다. nginx
   라우팅이 틀리면 여기서 걸린다.

실패하면 해당 유닛의 journald 로그를 마지막 40줄 함께 뱉는다.

마이그레이션은 expand-only여야 한다. 열을 지우거나 이름을 바꾸는 변경은 이
스크립트로 하지 않는다 — `docs/operations/STAGED_ROLLOUT.md`의 단계 배포를 따른다.

## GitHub Actions 자동 배포

`.github/workflows/web-deploy.yml`이 `main` 푸시에 반응해 SSH로 위 스크립트를
부른다. 2026-08-20부터 돌고 있다. 배포는 `concurrency: production-deploy`로
직렬화된다 — 앞선 배포가 마이그레이션 중일 수 있어 겹치면 안 된다.

경로 필터가 걸려 있어 `services/` · `packages/` · 락파일 · `deploy.sh`가 바뀔
때만 돈다. 문서만 고친 푸시로는 배포가 일어나지 않는다.

저장소 **Settings → Environments → `production`** 에 시크릿 넷을 넣는다.

| 시크릿 | 값 |
|---|---|
| `DEPLOY_SSH_HOST` | `140.245.74.246` |
| `DEPLOY_SSH_USER` | `ubuntu` |
| `DEPLOY_SSH_KEY` | 배포 전용 개인 키 전문 |
| `DEPLOY_KNOWN_HOSTS` | 서버의 호스트 키. **아래 함정 2를 먼저 읽는다.** |

`DEPLOY_SSH_PORT`는 22가 아닐 때만 넣는다.

배포 전용 키를 따로 만든다. 개인 키를 재사용하지 않는다.

```bash
ssh-keygen -t ed25519 -f ~/.ssh/expresso-deploy -N '' -C 'github-actions-deploy'
ssh-copy-id -i ~/.ssh/expresso-deploy.pub ubuntu@expresso.ai.kr
cat ~/.ssh/expresso-deploy          # DEPLOY_SSH_KEY 에 넣을 값
```

### 함정 1. 키가 서버에 있는지, ssh 설정에 속지 않고 확인한다

`ssh -i ~/.ssh/expresso-deploy ubuntu@140.245.74.246`이 붙었다고 해서 **그 키로
붙은 것이 아니다.** `~/.ssh/config`에 그 호스트 항목이 있으면 ssh는 거기 적힌
`IdentityFile`을 함께 내민다. `-o IdentitiesOnly=yes`를 줘도 막히지 않는다 —
그 옵션은 "설정과 명령줄에 적힌 것만 쓴다"는 뜻이지 명령줄만 쓴다는 뜻이 아니다.

실제로 이 자리에서 한 번 속았다. 배포 키가 서버에 없는데도 로컬 접속이 되어
깔린 줄 알았고, 워크플로만 계속 인증에서 떨어졌다.

**설정을 배제하고 재야 한다.**

```bash
ssh -F /dev/null -o IdentitiesOnly=yes -o BatchMode=yes \
    -i ~/.ssh/expresso-deploy ubuntu@140.245.74.246 'whoami'
```

서버에서 지문으로 대조해도 된다. `ssh-keygen -lf ~/.ssh/expresso-deploy.pub`의
지문이 아래 목록에 있어야 한다.

```bash
ssh ubuntu@expresso.ai.kr 'ssh-keygen -lf ~/.ssh/authorized_keys'
```

### 함정 2. `DEPLOY_KNOWN_HOSTS`는 `DEPLOY_SSH_HOST`와 같은 이름이어야 한다

known_hosts는 **접속할 때 쓴 이름으로** 찾는다. `ssh-keyscan expresso.ai.kr`의
결과를 넣어 두고 `DEPLOY_SSH_HOST`에 IP를 적으면, 같은 서버인데도 `Host key
verification failed`로 떨어진다.

둘 다 적어 두면 어느 쪽을 쓰든 걸리지 않는다. 이름을 쉼표로 잇는 것이
known_hosts의 문법이다.

```
expresso.ai.kr,140.245.74.246 ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFJxhIS0yTprHKrjfOL8F/GhXWixRIpdrJ1+o6QfVDwD
```

넣기 전에 그 값이 실제로 통하는지 워크플로와 같은 조건으로 잰다.

```bash
printf '%s\n' 'expresso.ai.kr,140.245.74.246 ssh-ed25519 AAAA...' > /tmp/kh
ssh -F /dev/null -o StrictHostKeyChecking=yes -o UserKnownHostsFile=/tmp/kh \
    -o IdentitiesOnly=yes -i ~/.ssh/expresso-deploy ubuntu@expresso.ai.kr 'whoami'
```

`ssh-keyscan`을 워크플로 안에서 매번 돌리지 않고 시크릿으로 고정한 이유는,
그때그때 받으면 중간에 낀 서버의 키를 그대로 믿게 되기 때문이다.

### 손으로 돌려 보기

```bash
gh workflow run web-deploy.yml --ref main
gh run list --workflow=web-deploy.yml --limit 1
```

성공한 로그의 끝은 이 모양이다.

```
API 준비됨 (시도 2)
웹 준비됨 (시도 2)
https://expresso.ai.kr/login → 200
https://expresso.ai.kr/home  → 307 (세션 없이 307이 정상)
배포 완료 cb66bda (이전 f6101cd)
```

실패하면 워크플로가 세 유닛의 journald 로그를 마지막 60줄 함께 뱉는다. 자주
보는 것들.

| 로그 | 원인 |
|---|---|
| `ssh ... "@"` 뒤 usage 출력 | 시크릿이 비어 있다. `production` 환경에 넣었는지 확인한다 |
| `Host key verification failed` | 함정 2 |
| `Permission denied (publickey)` | 함정 1 |
| `cd: ... No such file or directory` | `~/expresso`가 없다. 배포 사용자의 홈을 확인한다 |
| `pnpm을 찾지 못했습니다` | `deploy.sh`의 `NODE_BIN`이 실제 nvm 경로와 다르다 |

`production` 환경에 **필수 검토자**를 걸어 두면 배포 전에 승인 단계를 넣을 수
있다(Settings → Environments → production → Required reviewers).

## 확인

```bash
# 프로세스
systemctl is-active expresso-api expresso-worker expresso-web

# API — ready는 MySQL과 Redis를 함께 본다. 둘 중 하나라도 죽으면 503.
curl -s http://127.0.0.1:4500/health/live
curl -s http://127.0.0.1:4500/health/ready

# 바깥에서
curl -s -o /dev/null -w '%{http_code}\n' https://expresso.ai.kr/login   # 200
curl -s -o /dev/null -w '%{http_code}\n' https://expresso.ai.kr/home    # 307 → /login

# /v1 이 백엔드로 가는지 — 없는 경로를 일부러 찔러 본다.
# 백엔드가 받으면 계약 형태의 JSON이 오고, Next가 받으면 HTML 404가 온다.
curl -s https://expresso.ai.kr/v1/nonexistent | head -c 120
# 기대: {"error":{"code":"NOT_FOUND","message":"Resource not found",...
```

`/health/live`와 `/health/ready`는 `/v1` 아래가 아니라 백엔드 루트에 있고,
nginx는 `/v1/`만 넘기므로 **바깥에서는 닿지 않는다.** 의도한 것이다 — 상태
검사는 서버 안에서만 본다.

바깥에 열려 있으면 안 되는 포트도 확인한다. **다른 머신에서** 실행한다.

```bash
for port in 3500 4500 53306 56379; do
  timeout 5 bash -c "</dev/tcp/expresso.ai.kr/$port" 2>/dev/null \
    && echo "$port 열려 있다 — 막아야 한다" \
    || echo "$port 닫힘"
done
```

`/home`이 307이 아니라 200이면 `proxy.ts`가 안 걸린 것이다. 빌드 로그에
`ƒ Proxy (Middleware)` 줄이 있었는지 확인한다.

로그는 journald에 있다.

```bash
journalctl -u expresso-api -f
journalctl -u expresso-worker --since '10 min ago'
```

## 롤백

배포 스크립트가 직전 커밋을 `~/expresso/.last-deployed-commit`에 남긴다.

```bash
ssh ubuntu@expresso.ai.kr
cd ~/expresso
scripts/operations/deploy.sh "$(cat .last-deployed-commit)"
```

같은 스크립트를 이전 커밋으로 한 번 더 돌리는 것이 전부다. 빌드·재시작·확인이
배포와 같은 경로를 지난다.

**마이그레이션은 되돌리지 않는다.** 스키마를 되돌려야 하는 상황이면
`docs/operations/BACKUP_AND_RESTORE.md`의 복구 절차를 따른다. 그래서 배포 전
백업이 전제다.

```bash
scripts/operations/backup-mysql.sh /secure/path/expresso-$(date +%Y%m%dT%H%M%S).dump
```

## 아직 안 되는 것

배포해도 동작하지 않는 것들이다. 문제로 오해하지 않도록 적어 둔다.

- **공개 포트폴리오 방문자 경로.** `{slug}.xpresso.me` 서브도메인 라우팅이
  구현되어 있지 않다. `/site/{slug}`는 소유자가 자기 지면을 미리 보는 화면이고
  로그인을 요구한다. 백엔드에 `GET /v1/public/portfolios/:slug`는 있지만 웹
  클라이언트가 아직 부르지 않는다.
- **AI 기능.** `AI_PROVIDER=off`에서는 규칙 기반 구현이 쓰인다. 공고 본문 읽기와
  자유 지면 생성은 AI 없이는 아예 동작하지 않는다(규칙 폴백을 두지 않는다).
  `anthropic` 프로바이더는 미구현이다.
- **객체 저장소.** `MEDIA_PROVIDER=s3`는 어댑터가 없다. 서버 한 대를 넘어
  늘리기 전에 채워야 한다.
- **공고 수집.** `WORK24_API_KEY`가 없으면 워크넷 어댑터를 만들지 않는다.

## 부록 A — 서버 현황 조사

이미 뭔가 돌고 있는 서버라면 아래를 먼저 실행해 이 문서의 목표 구성과 어디가
다른지 확인한다.

```bash
{
  echo "## OS / 아키텍처"; uname -srm; cat /etc/os-release | head -2
  echo "## 런타임"; node -v 2>&1; pnpm -v 2>&1; docker -v 2>&1
  echo "## 듣고 있는 포트"; sudo ss -ltnp
  echo "## expresso 관련 유닛"; systemctl list-units --type=service --all | grep -i expresso
  echo "## pm2"; pm2 ls 2>&1 | head -20
  echo "## 컨테이너"; docker ps --format '{{.Names}}\t{{.Image}}\t{{.Ports}}' 2>&1
  echo "## nginx 사이트"; ls /etc/nginx/sites-enabled/ 2>&1; sudo nginx -T 2>/dev/null | grep -E 'server_name|proxy_pass|listen' | head -30
  echo "## 인증서"; sudo certbot certificates 2>&1 | head -20
  echo "## 체크아웃 위치"; ls -d /home/ubuntu/expresso /opt/expresso 2>/dev/null
  echo "## 디스크"; df -h / | tail -1
} 2>&1
```

비밀번호·토큰이 섞여 나올 수 있으니 붙여넣기 전에 훑어본다. `nginx -T`는 전체
설정을 뱉으므로 위처럼 걸러 낸 줄만 본다.

# Expresso 개발 포털

Expresso 팀의 명세 문서와 개발 콘솔입니다. 빌드 없이 브라우저에서 바로 렌더되며, Cloudflare Pages로 배포됩니다.

**https://expresso-dev-portal.pages.dev**

## 무엇이 들어 있나

| 문서 | 내용 |
|---|---|
| 개발 포털 | 도메인·기능·태스크 콘솔 · 칸반 보드 · 팀 위키 |
| 기능 명세서 | D1–D12 · 151 태스크 · 동작 규칙과 제약 |
| 구현 명세서 | 화면별 구성과 동작 · 치수 |
| 화면 정의서 | 00–10e 화면 20여 종 |
| 데이터 모델 · ERD | 테이블 정의 · 삭제 정책 · 상태 전이 |
| 기능 지도 · 마인드맵 | 도메인 간 의존 관계 · 기능 범위 |
| 개발 로드맵 | 16주 · 4명 · 77pt · 마일스톤 |
| 디자인 시스템 · 아이콘 · 랜딩 | 디자인 자산 |

기능 정의의 원본은 **기능 명세서**, 화면 동작은 **구현 명세서**, 테이블은 **데이터 모델 명세서**입니다.
포털에서 고치는 것은 논의와 결정(위키·보드)뿐이며, 명세 문서 자체는 원본에서 수정합니다.

## 구조

```
docs/       ← GitHub Pages가 서빙하는 폴더
  index.html          진입점. 포털로 리다이렉트 (?index 로 들어오면 문서 목록)
  *.dc.html           문서 13종
  support.js          dc-runtime — 문서를 렌더하는 런타임 (생성물, 직접 수정 금지)
  doc-page.js         명세 문서 공통 레이아웃
  task-spec.js        151 태스크 데이터 (포털 콘솔이 읽음)
  screen-map.js       화면 매핑 데이터
  image-slot.js       아이콘 문서용 헬퍼
  .nojekyll           Jekyll 빌드 건너뛰기
  robots.txt          검색엔진 색인 차단
source/     문서에 참조되지 않는 원본 자료 (배포 제외)
server/     포털 저장 백엔드 자리 — 아래 "알려진 한계" 참고
```

## 로컬에서 보기

```bash
python3 -m http.server 8000 --directory docs
```

`http://127.0.0.1:8000` 으로 접속합니다. `file://` 로 직접 열면 문서 간 링크와 iframe 뷰어가 동작하지 않습니다.

## 배포

Cloudflare Pages 프로젝트 `expresso-dev-portal`에 `docs/`를 직접 업로드합니다. 빌드 단계가 없습니다.

```bash
npx wrangler pages deploy docs --project-name=expresso-dev-portal --branch main
```

처음 쓰는 사람은 `npx wrangler login`으로 Cloudflare 인증을 먼저 해야 합니다.
push할 때 자동 배포되게 하려면 Cloudflare 대시보드에서 이 GitHub 저장소를 연결하십시오
(Workers & Pages → expresso-dev-portal → Settings → Builds & deployments).

### `.html` 이 사라지는 것은 정상입니다

Cloudflare Pages는 `/문서.dc.html` 요청을 `/문서.dc` 로 308 리다이렉트합니다(확장자 제거 정규화).
브라우저와 iframe이 리다이렉트를 그대로 따라가므로 문서 간 링크는 정상 동작합니다 — 주소창에
`.html` 이 없어도 문제가 아닙니다.

### GitHub Pages를 쓰지 않는 이유

`Expresso-Organization` 조직에서 GitHub Pages 배포가 4회 연속 실패했습니다. `build` 잡은 매번
성공(아티팩트 업로드 완료)하는데 `deploy` 잡이 `deployment_queued` 상태로 10분간 대기하다
타임아웃됩니다. 저장소·조직 설정(public, Actions 활성, `members_can_create_pages`,
`github-pages` 환경의 `main` 허용, 이메일 인증)은 모두 정상 확인했고, 같은 계정의 개인 저장소
Pages는 정상 동작하므로 신규 조직 쪽 문제로 보입니다. 실패한 run — `31102223605`,
`31103706549`, `31106905848`, `31108111972`.

## 알려진 한계

**보드·위키는 공유되지 않습니다.** 포털의 칸반 보드와 위키는 브라우저 `localStorage`
(`expresso-portal-progress` / `-board` / `-wiki` / `-me`)에 저장됩니다. Pages는 정적 호스팅이라
**팀원마다 각자의 데이터를 봅니다.** 콘솔(명세 탐색)은 읽기 전용이라 모두 같은 내용을 봅니다.

당장은 포털 보드의 **JSON 내보내기 / 가져오기**로 주고받습니다. 공유가 필요해지면 `server/` 에
저장 API를 만들고 포털의 저장 어댑터 한 곳(`loadBoard`/`saveBoard`, `loadWiki`/`saveWiki`)만 교체하면 됩니다.

**CDN에 의존합니다.** `support.js`가 React 18과 Babel standalone을 unpkg에서 런타임에 받아옵니다.
unpkg가 죽으면 모든 문서가 렌더되지 않습니다. 필요해지면 두 라이브러리를 저장소에 벤더링하십시오.

**파일명은 NFC로 유지하십시오.** 문서 파일명에 한글이 들어가고, 포털 JS가 파일명을 문자열 상수로
들고 있습니다. macOS는 파일명을 NFD(자모 분리)로 저장하는 경우가 있는데, 로컬에서는 파일시스템이
정규화해 줘서 멀쩡히 열리지만 **Pages(Linux)는 바이트 그대로 비교하므로 404가 납니다.**
문서를 추가하거나 이름을 바꾼 뒤에는 확인하십시오:

```bash
python3 -c "import os,unicodedata as u; print([f for f in os.listdir('docs') if u.normalize('NFC',f)!=f] or 'OK')"
```

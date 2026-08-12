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
docs/       ← Cloudflare Pages가 서빙하는 폴더
  index.html          진입점. 포털로 리다이렉트 (?index 로 들어오면 문서 목록)
  *.dc.html           문서 13종
  support.js          dc-runtime — 문서를 렌더하는 런타임 (생성물, 직접 수정 금지)
  doc-page.js         명세 문서 공통 레이아웃
  canvas-zoom.js      넓은 캔버스 문서 줌 — 아래 "다이어그램 줌" 참고
  task-spec.js        151 태스크 데이터 (포털 콘솔이 읽음)
  screen-map.js       화면 매핑 데이터
  image-slot.js       아이콘 문서용 헬퍼
  .nojekyll           Jekyll 빌드 건너뛰기
  robots.txt          검색엔진 색인 차단
source/     문서에 참조되지 않는 원본 자료 (배포 제외)
server/     포털 저장 백엔드 자리 — 아래 "알려진 한계" 참고
```

### 문서를 더하거나 이름을 바꿀 때

포털의 `NAV` 에 줄을 더하고, **목차를 붙일 문서라면 `NAV_TOC` 에도** 넣으십시오. 뷰어는 이
목록을 보고 열자마자 목차 자리를 잡습니다 — 빠뜨리면 문서를 다 그린 뒤에 목차가 붙으면서
iframe 폭이 줄어 화면이 한 번 흔들립니다. 넣어 두었는데 목차가 나오지 않으면 스스로 거둡니다.
파일명은 NFC로 — 맨 아래 확인 명령을 보십시오.

**목차를 안 붙이는 문서도 있습니다.** ERD · 기능 마인드맵은 절이 하나뿐이고, 기능 지도는
둘뿐이라 목차로 얻는 것보다 다이어그램이 268px 넓어지는 편이 낫습니다. 랜딩은 시안이라
제목 태그에 들어 있는 것이 페이지 카피지 목차가 아닙니다.

### 목차에 넣지 않는 제목

제목 태그를 썼다고 다 목차 항목은 아닙니다. `tocHeads` 가 세 가지를 걷어냅니다.

1. **목업 안의 제목** — 화면 정의서는 화면마다 제품 목업이 통째로 들어 있어 목업의 카피까지
   딸려 옵니다("결제 트래픽을 견디는 서버를 만듭니다"). 화면 제목에만 `[data-screen-label]`
   조상이 있으므로 그것만 남깁니다.
2. **문서 제목** — 맨 앞에 홀로 있는 `h1`.
3. **문서가 자기 목차를 둔 절** — 목차 안의 목차.

제목 앞에 붙은 번호 배지(화면 `00b`, 절 `01`, 도메인 `D1`)는 목차의 번호 칸으로 옮겨
정렬합니다. **목차를 만들 때와 눌러 이동할 때가 같은 목록을 봐야 번호가 어긋나지 않으므로
`scanToc` 과 `scrollDoc` 이 모두 `tocHeads` 하나만 씁니다** — 거르는 규칙을 고칠 때 한 곳만
고치면 되고, 한쪽에만 손대면 목차를 눌렀을 때 엉뚱한 곳으로 갑니다.

## 캔버스 문서 줌

폭이 고정된 캔버스 문서는 창에 다 들어가지 않습니다. `canvas-zoom.js`를 물린 문서는
오른쪽 아래에 배율 막대가 붙습니다.

| 문서 | 캔버스 폭 | 열었을 때 |
|---|---|---|
| 화면 정의서 | 7432px | **100%** — 실제 크기로 읽는 문서라 그대로 열고, 필요할 때 줄입니다 |
| 홈 히어로 시안 | 3706px | 창 폭에 맞춤 |
| 구조 다이어그램 (ERD) | 2900px | 창 폭에 맞춤 |
| 기능 마인드맵 | 2560px | 창 폭에 맞춤 |
| 기능 지도 | 2480px | 창 폭에 맞춤 |
| 개발 로드맵 | 1980px | 창 폭에 맞춤 |

기본값은 스크립트 태그로 정합니다 — `<script src="./canvas-zoom.js">`는 맞춤,
`data-default="100"`을 붙이면 원래 크기입니다.

| 조작 | |
|---|---|
| `−` `＋` · `-` `+` 키 | 한 칸씩 축소·확대 (1.25배) |
| `맞춤` · `1` 키 | 창 폭에 맞춤 (100%를 넘겨 키우지는 않음) |
| `100%` · `0` 키 | 원래 크기 |
| `ctrl`(또는 `⌘`) + 휠 · 트랙패드 핀치 | 커서 위치를 기준으로 확대·축소 |

배율은 문서별로 `localStorage`(`expresso-canvas-zoom:<문서명>`)에 남아 다음에 열 때 그대로 뜹니다.

방식은 dc-runtime이 그린 `#dc-root` 컨테이너에 `transform: scale`을 거는 것입니다. 런타임이
관리하는 것은 그 **자식**이라 리렌더에 지워지지 않고, transform된 박스는 스크롤 영역 계산에
그대로 반영되어 스크롤바도 같이 줄어듭니다. 포털의 목차 스크롤(`scrollDoc`·`seekInDoc`)도
같은 좌표계를 쓰므로 배율이 걸린 채로 정확히 동작합니다.

**사파리의 뒤로가기 스와이프도 같이 막습니다.** 캔버스 문서는 좌우 이동이 본래 조작인데,
가로로 밀다 끝에 닿으면 사파리가 그 제스처를 뒤로가기/앞으로가기로 가져가 버립니다.
`html { overscroll-behavior-x: none }` 에 더해, 가로가 우세한 휠 이벤트는 스크롤을 끝까지
먹인 뒤 남는 만큼을 `preventDefault` 로 삼킵니다(`guardSwipe`) — `overscroll-behavior` 만으로는
사파리에서 다 막히지 않습니다. 세로 스크롤과 브라우저 뒤로가기 버튼은 그대로입니다.
포털의 상단 탭 줄(`overflow-x: auto`)에는 같은 이유로 `overscroll-behavior-x: contain` 을 걸어
두었습니다 — 창이 좁아 탭 줄이 넘칠 때 끝에서 페이지 이동으로 새지 않게 합니다.

**썸네일 iframe 안에서는 켜지지 않습니다.** 포털은 화면 정의서를 두 가지로 씁니다 —
뷰어(`iframe#docframe`)로 통째로 띄우기도 하고, 위키 카드의 화면 썸네일로도 씁니다. 썸네일은
포털이 그 iframe을 직접 `transform`해서 원하는 화면만 잘라내므로(포털의 `fitScreen`) 안쪽에서
또 배율을 걸면 어긋납니다. 그래서 `canvas-zoom.js`는 **최상위 문서이거나 `#docframe`일 때만**
동작합니다(`window.frameElement`로 판별). 포털에서 iframe에 새 용도를 추가한다면 이 판별을
같이 손봐야 합니다.

디자인 시스템·아이콘·랜딩은 `max-width` 기반이라 이미 창에 맞아 줌을 넣지 않았습니다.

## 기능 마인드맵 — 펼치기와 태스크 문서

기능은 **접힌 채로** 뜹니다. 151개를 한꺼번에 펼치면 전체 그림이 안 보입니다. 기능 카드를
누르면 그 기능의 태스크만 펼쳐지고(`▸` → `▾`), 태스크를 누르면 그 태스크의 정의가 모달로
뜹니다 — 내용은 `task-spec.js`(`window.TASK_SPEC`)에서 읽습니다. 오른쪽 위 버튼은 모두
펼치기 / 모두 접기입니다.

**모달은 `#dc-root` 바깥(body)으로 내보냅니다.** `canvas-zoom.js`가 `#dc-root`에 `transform`을
걸어 두어서, 그 안에 두면 `position: fixed`가 화면이 아니라 캔버스 기준이 되고 배율까지 따라
줄어듭니다. `ReactDOM.createPortal(…, document.body)`로 빼냅니다. 캔버스 문서에 오버레이를
새로 붙일 때는 모두 같은 함정이 있습니다.

포털이 쓰는 dc-runtime의 두 가지 성질도 같이 알아 두십시오.

- **`componentDidUpdate`에 `prevState`는 오지 않습니다.** `prevProps` 하나만 넘어옵니다.
  `componentDidUpdate(prevProps, prevState)`로 받아 `prevState.x`를 읽으면 갱신마다 던집니다
  (콘솔에 `Cannot read properties of undefined`). 직전 값은 인스턴스 필드로 직접 들고
  비교하십시오.
- **`{{ }}` 바인딩은 `React.isValidElement`로 요소인지 판단합니다.** 포털은 이 검사를 통과하지
  못해 `[object Object]`로 찍힙니다. `React.Fragment`로 한 겹 싸서 넘기십시오.

## 로컬에서 보기

```bash
python3 -m http.server 8000 --directory docs
```

`http://127.0.0.1:8000` 으로 접속합니다. `file://` 로 직접 열면 문서 간 링크와 iframe 뷰어가 동작하지 않습니다.

## 배포

Cloudflare Pages 프로젝트 `expresso-dev-portal`에 `docs/`를 직접 업로드합니다. 빌드 단계가 없습니다.

```bash
pnpm dlx wrangler@4 pages deploy services/dev-portal/docs \
  --project-name=expresso-dev-portal \
  --branch main
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

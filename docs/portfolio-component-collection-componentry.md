# Componentry 추가 수집

Componentry의 UI 53개와 블록 3개를 원본 React 코드로 실행해 포트폴리오 라이브러리의 카드와 상세 화면에 연결했습니다.

- 기존 라이브러리에는 Shoogle에서 발견한 과거 `componentry.fun` 공급자 주소 1건만 있었습니다. 이번 항목 56개는 `componentry.dev`의 공식 registry에서 새로 수집했습니다.
- 56개 모두 예시 입력으로 브라우저 렌더링을 확인했습니다. 목록 카드에는 그 화면을 캡처한 정적 이미지가 나오고, 상세 모달에는 원본 React 컴포넌트의 조작 가능한 실행 화면이 열립니다.
- 공식 시연 영상은 원본 출처 기록으로 보존했습니다. 확인 당시 정상 응답 36개, HTTP 404 13개, 영상 주소 없음 7개였습니다. 포털 미리보기에는 영상 대신 로컬 실행 화면을 표시합니다.
- 설치용 registry JSON, 저장소의 원본 TSX, MIT 고지를 별도 자료로 보존했습니다. GSAP 의존 항목 4개는 별도 이용 조건 확인 대상으로 표시했습니다.
- 56개 전부 제품 등록·실제 경력 데이터·반응형·키보드·성능 검증 전입니다. 브라우저 실행 성공과 포트폴리오 지면 품질을 분리해 기록합니다.

수집 기준: 2026-09-27 · 공식 저장소 `harshjdhv/componentry` commit `0fd9e13b344cfa36a0332705611f877bbd8e85d9` · [Componentry 자료 목록](./Expresso%20개발%20포털.dc.html#/library/all?source=componentry)

## 포트폴리오 적용 후보

| 범위 | 원본 예 | 후속 검증 |
| --- | --- | --- |
| 프로젝트 서사 | Case Study Flip Stack, Sticky Scroll Cards | 문제·기여·결과가 긴 한국어 사례에서도 읽히는지 확인 |
| 작품 목록과 미디어 | Collection Surfer, Orbit Card Stack, Liquid Glass Carousel | 이미지 누락·화면 폭·키보드 탐색과 정적 대체 확인 |
| 기술 설명 | Circuit Board, Annotated Text | 실제 아키텍처 데이터·주석·근거와 연결 |
| 히어로 배경·타이포 | Spectral Ribbon, Grain Gradient, Text Morph | 전경 대비·모션 감소·저사양 기기 확인 |
| 페이지 블록 | Gradient Hero 01, Pricing 01·02 | 히어로는 포트폴리오 문구로 검증, 가격표는 보조 참고로 유지 |

위 분류는 공식 registry의 이름·설명에 따른 탐색용입니다. 시각 품질 통과나 제품 이식 승인을 뜻하지 않습니다.

## 이용 조건과 확보 범위

[공식 저장소](https://github.com/harshjdhv/componentry)는 MIT로 공개되어 있습니다. 설치 payload의 React·Tailwind·모션·WebGL 의존성은 항목마다 다릅니다. `flipping-word-swap`, `image-trail`, `layered-stack`, `liquid-glass-carousel`의 registry payload에는 GSAP 의존성이 있어 제품 사용 전에 [GSAP 이용 조건](https://gsap.com/licensing/)을 별도로 확인해야 합니다. 공급자 시연 영상은 링크로만 연결했고 파일을 재배포하지 않았습니다.

공식 시연 영상은 원본 표현을 살피는 자료입니다. 카드의 캡처와 상세 iframe은 설치한 의존성·예시 입력으로 원본 코드를 실행한 결과입니다. GitHub Calendar는 외부 API 대신 고정된 예시 기여 데이터를 제공하고, 서명 폰트와 로고 SVG는 원본 저장소의 자산을 함께 보존했습니다. 긴 한국어 콘텐츠와 실제 포트폴리오 지면 품질은 아직 측정하지 않았습니다. 영상 주소의 응답 상태와 확인 시각은 수집 lock에 기록했습니다.

## 재수집과 검증

고정 원본과 해시, 공식 설명·시연 주소는 [`scripts/library/componentry-source.json`](../scripts/library/componentry-source.json)에 있습니다. 원본 저장소를 해당 commit으로 준비한 다음 아래 명령을 실행합니다.

```sh
node scripts/library/collect_componentry.mjs
pnpm --dir scripts/library/renderer install --ignore-workspace --frozen-lockfile
node scripts/library/renderer/build-componentry.mjs
# 별도 터미널에서 python3 scripts/serve-docs.py 8918 실행
node scripts/library/renderer/verify-componentry.mjs
node scripts/library/publish_componentry.mjs
node scripts/library/renderer/verify-componentry-embed.mjs
node scripts/library/build_portal_search.mjs
node --test scripts/library/componentry.test.mjs scripts/library/portal-controls.test.mjs
```

수집기는 registry 목록과 원본 파일의 해시를 확인합니다. 렌더러는 56개 JSX를 빌드하고 Chrome에서 오류·빈 화면을 확인한 뒤 캡처를 남깁니다. 게시기는 56개 전체의 성공 기록과 캡처 해시가 일치할 때만 `docs/library/componentry.json` 및 자료별 상세 JSON을 실행 미리보기로 갱신합니다. 마지막 검사는 포털과 같은 sandbox iframe에서 56개가 실행되는지 확인합니다. 다음 단계에서 포트폴리오용 입력 계약을 정의하고 실제 길이의 콘텐츠로 대표 후보를 검증합니다.

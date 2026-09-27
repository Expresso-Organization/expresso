# Componentry 추가 수집

Componentry의 공식 registry에 있는 UI 53개와 블록 3개를 고정 버전의 원본 코드·이용 조건·공식 시연 링크와 함께 포트폴리오 라이브러리에 추가했습니다.

- 기존 라이브러리에는 Shoogle에서 발견한 과거 `componentry.fun` 공급자 주소 1건만 있었습니다. 이번 항목 56개는 `componentry.dev`의 공식 registry에서 새로 수집했습니다.
- UI 36개에는 실제 응답을 확인한 공급자 시연 영상을 연결했습니다. 영상 주소 13개는 HTTP 404였고, 나머지 UI 4개와 블록 3개는 영상 주소가 없습니다. 이 20개 항목은 공식 설명과 원본 코드로 식별하며 실행 화면 검증을 남겨 두었습니다.
- 설치용 registry JSON, 저장소의 원본 TSX, MIT 고지를 별도 자료로 보존했습니다. GSAP 의존 항목 4개는 별도 이용 조건 확인 대상으로 표시했습니다.
- 56개 전부 제품 등록·실제 포트폴리오 콘텐츠 검증 전입니다. 공급자의 시연 영상과 Expresso 실행 예제는 구분해 표시합니다.

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

공식 시연 영상은 원본 표현을 살피는 자료입니다. 로컬에 설치한 컴포넌트의 실행 성공, 긴 콘텐츠에 대한 적합성, 실제 포트폴리오 지면 품질은 아직 측정하지 않았습니다. 영상이 없거나 응답이 끊긴 20개 항목에는 코드·설명 미리보기를 표시하고 원본 문서 또는 registry 주소로 이동할 수 있게 했습니다. 영상 주소의 응답 상태와 확인 시각은 수집 lock에 기록했습니다.

## 재수집과 검증

고정 원본과 해시, 공식 설명·시연 주소는 [`scripts/library/componentry-source.json`](../scripts/library/componentry-source.json)에 있습니다. 원본 저장소를 해당 commit으로 준비한 다음 아래 명령을 실행합니다.

```sh
node scripts/library/collect_componentry.mjs
node scripts/library/build_portal_search.mjs
node --test scripts/library/componentry.test.mjs scripts/library/portal-controls.test.mjs
```

수집기는 registry 목록과 원본 파일의 해시를 확인합니다. 실행 결과는 `docs/library/componentry.json`, 자료별 상세 JSON, `docs/library/materials/componentry/`에 저장합니다. 다음 단계에서 포트폴리오용 입력 계약을 정의하고 실제 길이의 콘텐츠로 대표 후보부터 렌더링합니다.

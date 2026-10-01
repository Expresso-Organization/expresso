# 모델 생성 json-render Spec 검증

로컬 Qwen3.5 9B가 가상 포트폴리오 입력에서 json-render Spec을 직접 생성했고, 엄격한 Catalog 계약 검사와 브라우저 렌더링을 통과했다.

- 느슨한 Spec 형식에서는 두 시도 모두 실패했다. 모델이 `recipe`와 `annotation`의 열거형 문자열을 `$state` 참조로 잘못 출력했다.
- 컴포넌트 종류·속성·허용 데이터 경로를 JSON Schema로 전달한 실행은 첫 시도에 통과했다.
- 모델 Spec은 `career → evidence` 순서를 선택했다. 기존 `gallery` 구성 컴파일러는 `evidence → career` 순서를 낸다. 실제 HTML은 모델이 선택한 순서로 렌더링됐다.
- 1440px·390px, Orbit 카드 방향키 선택, 모션 `showcase`, 스크립트 없는 읽기, 독립 HTML의 외부 요청 없음·가로 넘침 없음·브라우저 오류 없음까지 확인했다.

## 입력과 실행

입력은 실제 인물·경력과 관계없는 `scripts/library/renderer/portfolio/samples/fresh-service-designer/content.json`이다. 세 프로젝트의 화면 SVG도 같은 폴더에서 작성했다. 사용자의 CV는 사용하지 않았다.

`scripts/library/renderer/run-portfolio-once.mjs`는 로컬 Ollama의 `api/chat`에 이 입력의 프로필·프로젝트 요약과 동적 JSON Schema를 보낸다. 모델의 `Spec` 원문을 `validateModelSpec`와 json-render Catalog로 검사하고, 통과한 원문을 `Renderer`에 직접 전달한다. 렌더러가 생성한 독립 HTML에는 CSS·모션 실행기·SVG 자산을 포함한다. Ollama `format`에 JSON Schema를 전달하는 방식은 [Ollama 구조화 출력 문서](https://ollama.com/blog/structured-outputs)를 따른다.

```bash
node scripts/library/renderer/run-portfolio-once.mjs \
  --input scripts/library/renderer/portfolio/samples/fresh-service-designer/content.json \
  --out docs/library/previews/portfolio/runs/model-spec-service-designer \
  --spec-model qwen3.5:9b-q8_0 \
  --avoid docs/library/previews/portfolio/featured-standard-showcase-bento.json
```

같은 모델 응답은 `--spec docs/library/previews/portfolio/runs/model-spec-service-designer/composition.json`으로 다시 렌더링할 수 있다. 재렌더링한 HTML의 SHA-256은 최초 결과와 같았다.

개발 포털에서는 기록된 모델 출력을 다시 렌더링하면서 `--comparison docs/library/previews/portfolio/runs/library-comparison`을 전달한다. 이 옵션은 `index.html` 위에 동일한 가상 입력의 세 디자인 미리보기 카드를 붙인다. 카드에서 각 완성 페이지를 열 수 있고, 비교 영역을 접으면 기존 페이지를 그대로 읽을 수 있다. 비교 UI가 없는 결과는 `portfolio.static.html`에 따로 보존한다.

## 결과와 범위

| 자료 | 위치 |
| --- | --- |
| 모델 출력·검사 결과 | `docs/library/previews/portfolio/runs/model-spec-service-designer/model-attempts.json` |
| 실패한 느슨한 형식의 두 출력 | `docs/library/previews/portfolio/runs/model-spec-service-designer/diagnostics/loose-schema-attempts.json` |
| 구성·모델 Spec·가상 입력 | `docs/library/previews/portfolio/runs/model-spec-service-designer/composition.json` |
| 실행 상태·입력/Spec/HTML 해시 | `docs/library/previews/portfolio/runs/model-spec-service-designer/run.json` |
| 세 디자인 비교와 기존 페이지 | `docs/library/previews/portfolio/runs/model-spec-service-designer/index.html` |
| 비교 UI가 없는 독립 HTML | `docs/library/previews/portfolio/runs/model-spec-service-designer/portfolio.static.html` |

이 실험은 **하나의 가상 입력과 로컬 모델에서 구조화 Spec 생성이 가능한지** 확인했다. 임의 입력에서의 성공률, 실제 사용자 콘텐츠 품질, 생성 API·Worker·저장소 연결은 이 결과로 검증되지 않았다. 현재 생성 Registry의 선택지는 17종이다.

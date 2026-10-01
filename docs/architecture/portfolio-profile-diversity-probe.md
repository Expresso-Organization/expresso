# 서로 다른 가상 프로필의 포트폴리오 생성 시험

직무와 프로젝트가 서로 다른 가상 프로필 세 개를 같은 모델·기본 요청으로 생성했지만, 세 페이지 모두 동일한 어두운 팔레트와 스포트라이트 히어로를 선택했다.

- 입력: 로봇 엔지니어, 편집 디자이너, 기후 데이터 분석가. 각 인물은 가상의 경력 2건, 프로젝트 3건, 근거 자료 3건과 서로 다른 원본 SVG 3개를 갖는다.
- 생성: 로컬 `qwen3.5:9b-q8_0`이 각 입력의 디자인 선택과 json-render Spec을 작성했다. 세 Spec 모두 첫 검사에서 통과했다.
- 검증: 독립 HTML을 390px·1440px 브라우저에서 열어 내용 보존, 이미지, 앵커, 오류, 가로 넘침을 확인했다.
- 관찰: 프로젝트 이미지와 프로젝트 목록 표현은 달라졌다. 첫 화면의 팔레트·히어로와 프로젝트 사례의 큰 구조는 여전히 유사했다.

## 시험 조건

인물과 조직, 경력, 프로젝트는 모두 이 시험을 위해 만든 가상 정보다. 사용자 CV와 실제 개인 정보를 쓰지 않았다. 세 입력에는 동일한 기본 요청을 사용했고, 디자인을 강제하는 `--brief`나 이전 결과 회피용 `--avoid`를 주지 않았다. 직무와 프로젝트 내용이 선택에 미치는 영향을 보기 위한 조건이다.

| 인물 | 직무 | 원본 그림의 종류 | 모델이 고른 구성 |
| --- | --- | --- | --- |
| 한도윤 | 로봇 엔지니어 | 경로·그리퍼·창고 통로 도면 | `featured` · `midnight/sans/studio` · `spotlight/bento` |
| 오수빈 | 편집 디자이너 | 책 표지·전시 도록·인쇄 지도 | `gallery` · `midnight/serif/editorial` · `spotlight/mosaic` |
| 정하린 | 기후 데이터 분석가 | 열지도·강우 차트·녹지 지도 | `featured` · `midnight/serif/editorial` · `spotlight/bento` |

입력은 `scripts/library/renderer/portfolio/samples/fictional-profiles/`에 있다. `build.mjs --check`는 세 JSON과 아홉 SVG가 입력 정의와 일치하는지 확인한다. 기존 전시 형식인 지도·관계도·길찾기에 맞지 않는 프로젝트는 제공한 원본 SVG를 표시한다. 이를 위해 `ProjectScene`에 원본 이미지 표시 경로를 추가했다.

## 결과와 해석

세 HTML과 각 모델 응답은 `docs/library/previews/portfolio/runs/profile-{robotics-engineer,editorial-designer,climate-analyst}/`에 보존했다. [실행 보고서](../library/previews/portfolio/runs/profile-diversity-report.json)에 입력·HTML 해시, 선택 결과와 브라우저 검사 결과가 있다.

세 모델 선택은 같은 `midnight` 팔레트와 `spotlight` 히어로에 수렴했다. 로봇과 기후 페이지는 `bento` 목록까지 같았다. 편집 디자이너의 `mosaic` 목록과 각 분야의 이미지·서체가 차이를 만들었지만, 페이지 전체의 색과 섹션 골격은 비슷했다. 따라서 서로 다른 프로필만 공급하는 것으로는 원하는 지면 다양성이 확보되지 않았다. 이 결론은 이 모델·요청·세 표본에 한정된다.

현재 Spec의 페이지 자식은 소개, 목록, 모든 프로젝트 사례, 경력, 근거, 연락처로 고정된다. 모델이 선택하는 사례 변형도 같은 `ProjectCaseStudy`의 내부 표현 세 가지다. 다음 실험은 직무에 맞는 섹션 단위 구성과 프로젝트 사례 지면을 Catalog·Registry·Spec에 추가한 뒤 같은 세 입력으로 다시 비교해야 한다.

## 재현

```bash
node scripts/library/renderer/portfolio/samples/fictional-profiles/build.mjs --check
for profile in robotics-engineer editorial-designer climate-analyst; do
  node scripts/library/renderer/run-portfolio-once.mjs \
    --input "scripts/library/renderer/portfolio/samples/fictional-profiles/$profile/content.json" \
    --out "docs/library/previews/portfolio/runs/profile-$profile" \
    --spec-model qwen3.5:9b-q8_0
done
python3 -m http.server 8932 --bind 127.0.0.1 --directory docs
node scripts/library/renderer/verify-portfolio-profile-diversity.mjs
```

다시 모델을 호출하면 선택 결과가 바뀔 수 있다. 저장된 모델 원문을 그대로 재현하려면 각 실행 폴더의 `model-attempts.json`을 `--model-record`에 전달한다. 브라우저 검증 스크립트는 모델 원문과 Spec의 일치, 화면의 내용 보존, 390px·1440px 렌더링을 검사한다.

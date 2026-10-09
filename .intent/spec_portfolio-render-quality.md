---
title: 생성 포트폴리오의 원본 렌더링 결함 수정
slug: portfolio-render-quality
stage: spec
status: accepted
intent: .intent/intent_portfolio-render-quality.md
date: 2026-10-09
---

# 생성 포트폴리오의 원본 렌더링 결함 수정 — 명세

## 요구사항

- [ ] R1. 원본을 고른 사례의 항목 표현이 `Case*` 유형을 따른다. 기술형=`table.sp-facts`, 과정형=`ol.sp-steps`, 기사형·전시형·패널=`div.sp-details`. 사례 영역에 `dl`·`dd`가 없다.
- [ ] R2. 사례 원본 6개를 렌더링했을 때 `[data-source-slot=section]` 안에 텍스트·이미지·SVG가 없고 배경이나 테두리가 칠해진 요소가 0개다. 측정 기준선은 Feature 1에서 5개, Feature 4에서 17개다.
- [ ] R3. 원본 히어로 32개는 현재 렌더링을 유지한다. 단, 원본 코드에 글자가 있었는데 그 글자를 모두 지워 빈 상자가 된 요소는 출력하지 않는다.
- [ ] R4. 입력 이미지가 있는 히어로는 이름(`h1`)과 자기 정의(`.sp-source-definition`)를 `.sp-source-nameplate` 하나로 묶고, 그 판에 `backdrop-filter: blur()`를 적용한다. 배경 이미지와 기존 어둡게 처리는 유지한다.
- [ ] R5. 관련 자료 링크의 글자가 근거 항목의 `title`이다. "관련 자료 N" 형식이 없다.
- [ ] R6. 원본을 고른 사례의 이미지가 같은 유형의 원본이 아닌 사례와 같은 CSS 규칙(기술형 반 열, 과정형 최대 폭 900px, 전시형 최대 높이 900px)을 따른다.
- [ ] R7. Feature 원본에 연결한 항목 수를 빌드 결과(`inventory.json`의 `runtime.boundDetails`)에서 읽는다. `renderer.tsx`에 5·3 숫자가 없다.
- [ ] R8. `check-collected-runtime.mjs --browser`와 `verify-structured-profiles.mjs`가 R1·R2·R4·R5를 측정하고 위반 시 실패한다.
- [ ] R9. 저장 Spec 세 개를 모델 호출 없이 다시 렌더링한 실행 기록이 `runs/library-selection-rerender-2026-10-09/`에 있고 검증을 통과한다.

## 설계

**항목 표현 공유(R1·R6)** — `renderer.tsx`의 원본이 아닌 경로가 쓰는 표·단계·설명 묶음을 `Details({ section, kind, skip })`로 꺼내 두 경로가 함께 쓴다. 원본 경로의 `.sp-source-details`에 `sp-case-${kind}` 클래스를 붙여, 기존 유형별 그리드와 이미지 규칙(`styles.ts` 11–13행)이 그 안에서 그대로 적용되게 한다. `article`에는 붙이지 않는다. 원본 블록과 설명 블록이 그리드 항목으로 갈라지기 때문이다.

**빈 샘플 요소 제거(R2·R3)** — `source-jsx.tsx`의 `BoundElement`는 지금 글자만 지운다. 같은 자리에서 원본 하위 트리를 미리 살핀다. 원본 코드에 글자(문자열·숫자)가 있었는데 남는 내용이 하나도 없으면 그 요소를 `null`로 반환한다. 남는 내용은 다음 넷이다. `clean`이 남기는 문자열, 값이 있는 `data-portfolio-field`, 입력 이미지가 있는 `img`, 렌더러가 넘긴 호스트 요소(`children`으로 들어온 사례 설명). 아이콘 컴포넌트처럼 자식이 없는 함수 컴포넌트는 남는 내용으로 세지 않는다. 원래 글자가 없던 순수 장식(그라디언트·격자·아이콘 상자)은 판정 대상이 아니므로 히어로 구도가 유지된다. 이 규칙으로 Feature 4의 샘플 패널(막대·도넛·진행 막대 포함)과 Feature 1의 알약 상자가 빠진다.

**슬롯 수(R7)** — `build-collected-registry.mjs`의 Feature 변환(h3마다 `N.label`, p마다 `N.text`)을 `bindFeatureFields(source)` 함수로 분리한다. 이 함수는 변환 코드와 연결 개수를 함께 돌려준다. 같은 함수를 esbuild `onLoad`와 메타데이터 생성에서 쓰고, `runtime.boundDetails`에 기록한다. `library.ts`가 `collectedBoundDetails(sourceId)`로 이 값을 노출한다.

**근거 제목(R5)** — `renderStructuredPortfolio`가 `content.evidence`에서 `id → title` 맵을 만들어 React context로 넘긴다. `Sources`가 그 맵에서 제목을 읽는다.

**히어로 블러 판(R4)** — `BoundElement`가 소개용 `h1`을 그리는 분기에서 `h1`과 자기 정의 `p`를 `div.sp-source-nameplate`로 감싼다. CSS는 `library.ts`의 `COLLECTED_PORTFOLIO_CSS`에 넣고 `[data-has-media=true]`일 때만 블러와 반투명 판을 적용한다. 판은 `display:inline-block`로 두어 원본 컨테이너의 정렬(가운데·왼쪽)을 따른다.

**재렌더링(R9)** — `run-structured-profiles.ts`에 `PORTFOLIO_RERENDER_FROM=<runId>` 모드를 추가한다. 저장된 `run.json`의 Spec·입력을 현재 렌더러에 넣고, `model-record.json`은 그대로 복사한다. `run.json`에는 `rerenderOf`와 새 `htmlSha256`을 기록한다. `verify-structured-profiles.mjs`는 모델 원문과 Spec이 같은지 기존대로 검사한다.

## 버린 대안

- 빈 요소를 CSS `:empty`로 숨기기 — 히어로의 의도된 빈 장식 요소(격자·그라디언트)까지 숨긴다. 서버 렌더링 결과에서는 자식이 `null`인 부모가 빈 요소가 되므로 단계별 판정도 어렵다.
- 렌더링한 HTML 문자열을 후처리하기 — 원본마다 구조가 달라 정규식 처리가 깨지기 쉽다.
- Feature 슬롯 수를 렌더 순서에 기대어 실행 중에 세기 — 카드 원본은 설명을 자식으로 받아 순서가 보장되지 않는다.
- Feature 원본 파일 직접 수정 — 보관 원본과 SHA-256 검증 원칙에 어긋난다.

## 함정

- `clean`은 바인딩 값에 포함되는 문자열을 남긴다. 샘플 글자가 우연히 입력 값의 부분 문자열이면 남는다. 이번 판정은 `clean` 결과를 그대로 따른다.
- 카드 원본은 사례 설명을 `children`으로 받는다. 이 설명은 원본의 JSX가 아니라 렌더러의 호스트 요소이므로, 남는 내용으로 세지 않으면 카드 전체가 사라진다.
- 수집 빌드는 `scripts/library/renderer`의 별도 의존성이 필요하다. 변경 전 빌드가 커밋된 결과와 바이트 단위로 같음을 확인했다(2026-10-09).
- `inventory.json`이 바뀌면 `inventoryHash`가 바뀐다. 저장된 선택 기록은 당시 해시를 보관할 뿐 대조하지 않는다.
- 블러 판은 이미지 속 글자를 지우지 않는다. 판 밖의 이미지 글자는 여전히 보인다.

## 완료 기준

```bash
pnpm typecheck                      # 통과
pnpm test                           # 통과 (renderer 신규 테스트 포함)
node scripts/library/renderer/check-collected-runtime.mjs --browser   # 38개 × 3폭 통과, 사례 원본 잔여 요소 0
PORTFOLIO_RERENDER_FROM=library-selection-2026-10-07 PORTFOLIO_RUN_ID=library-selection-rerender-2026-10-09 pnpm exec tsx scripts/library/renderer/run-structured-profiles.ts
node scripts/library/renderer/verify-structured-profiles.mjs library-selection-rerender-2026-10-09   # 세 프로필 통과
```

포털에 배포된 재렌더링 결과를 1440px·390px로 열어 사례 항목표, 히어로 이름 판, 관련 자료 제목을 화면으로 확인한다.

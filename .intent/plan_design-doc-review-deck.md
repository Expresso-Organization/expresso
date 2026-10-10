---
title: 설계서 발표 자료 — 발표 내용과 설계서를 나란히 보여 주는 덱
slug: design-doc-review-deck
stage: plan
status: accepted
date: 2026-10-10
---

# Plan — 설계서 발표 자료

1. **복사와 정리**: `cp docs/templates/expresso-deck.html docs/졸업작품-설계서-발표.html`.
   - 31개 배치 슬라이드는 지우고 17장을 새로 짠다.
   - 헤더 주석, `<title>`을 바꾼다.
2. **분할 지면 CSS**: 「발표 · 설계서 분할」 블록을 추가한다.
   - `.frame`의 오른쪽 여백은 960 + 64px로 잡는다.
   - `.docpane`(position absolute, left 960, z-index 5, 바탕 `--ex-canvas`)과 iframe 크기를 정한다.
   - 장 전환은 페이드아웃 후 페이드인으로 바꾸고, 이유를 주석으로 남긴다.
3. **설계서 연결 스크립트**: 컨트롤러 뒤에 둔다.
   - iframe이 로드되면 설계서에 스타일을 넣는다.
   - `deck.show`를 감싸 `data-doc`을 읽고, 대상을 찾아 스크롤과 강조를 한다.
   - iframe 안의 키 입력을 덱으로 넘긴다.
   - 미리보기 · 내보내기에서는 바로 이동한다.
4. **슬라이드 17장**: 왼쪽 `.frame`에 레일 · 킥커 · `h2` · 본문 부품(카드 · 수치 · 짧은 표 · 읽는 법 패널)을 넣는다.
5. **등록**: `docs/index.html`, 포털 `DECKS`에 추가하고 `node scripts/library/build_portal_search.mjs`를 실행한다.
6. **검증**: `python3 scripts/serve-docs.py`로 띄운다.
   - 1–17장을 넘기며 대상, 넘침, 콘솔 오류를 확인한다.
   - 포털 `#/doc/deck`에서 연다.
7. **배포**: 커밋, PR, 머지, 포털 배포 워크플로 성공, 라이브 확인 순서로 진행한다.

## 실행 중 벗어난 곳

- 5단계: `build_portal_search.mjs`는 라이브러리 항목만 색인한다. 덱 목록에는 영향이 없어 결과 파일이 바뀌지 않는다.
- 포털 이동 스크립트 경로: 양식의 `deck-portal-navigation.js`를 `templates/deck-portal-navigation.js`로 고쳤다. 사본은 `docs/` 바로 아래에 놓이기 때문이다.
- 편집기 저장: `beforeSave`에서 오른쪽 위치 표시를 비운다. 그러지 않으면 실행 중 쓴 글자가 파일에 남는다.
- 6단계 검증 서버: 미리보기 도구가 메인 체크아웃의 `.claude/launch.json`만 읽는다. 그래서 워크트리의 `scripts/serve-docs.py 8911`을 따로 띄워 확인했고, `launch.json`은 커밋하지 않았다.

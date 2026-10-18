---
title: 설계서 핵심 내용 굵게 · 하이라이트 표시
slug: design-doc-emphasis
stage: plan
status: accepted
spec: .intent/spec_design-doc-emphasis.md
date: 2026-10-06
---

# 설계서 핵심 내용 굵게 · 하이라이트 표시 — 계획

## 바뀌는 파일

`docs/졸업작품-설계서.html` · `.pdf`.

## 순서

1. `mark` CSS를 넣는다.
2. 장 조각을 나누고 검사 스크립트(`check-emphasis.py`)를 만든다.
3. 하위 에이전트 넷이 조각을 고치고 검사를 통과시킨다.
4. 조각을 합쳐 전체 검사 → PDF → 장별로 훑어보기 → 커밋 `docs: 설계서 핵심 문장 하이라이트와 강조 정리`.
5. PR · 배포.

## 가장 위험한 단계

3단계. 에이전트가 글자를 바꾸거나 표 안을 건드릴 수 있다 — R5 · R6 검사가 실패하면 그 조각을 되돌린다.

## 검증 명령

```bash
python3 check-emphasis.py <원본 조각> <고친 조각>
node scripts/doc-pdf.mjs docs/졸업작품-설계서.html
```

## 실행 중 벗어난 곳

없음

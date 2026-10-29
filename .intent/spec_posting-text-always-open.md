---
title: 공고 원문 상시 펼침
slug: posting-text-always-open
stage: spec
status: draft
intent: .intent/intent_posting-text-always-open.md
date: 2026-10-28
---

# 공고 원문 상시 펼침 — 명세

## 요구사항

- [ ] 공고 원문 블록이 `<details>` · `<summary>`가 아닌 `<div>`로 선다. `open` 속성이 없다.
- [ ] `hasStructure`와 그 주석이 사라진다. 이 값은 원문의 `open`과 보충 문구에만 쓰였다.
- [ ] `.rawNote`와 그 안의 두 문구(글자 수 · "아직 요건을 뽑지 않아…")가 사라진다.
- [ ] `.rawSummary`가 `.rawTitle`이 된다. `cursor: pointer` · `list-style: none` · `::before` 화살표 ·
      `::-webkit-details-marker` · `.rawSection[open]` 규칙이 사라진다. 글자 크기와 굵기는 그대로다.
- [ ] `job.descriptionRaw`가 없으면 지금처럼 블록 전체가 그려지지 않는다.
- [ ] "공고 원문" 위 주석이 "왜 원문을 늘 펴 두는가"를 말한다. 접기 기준을 설명하던 문단은 지운다.

## 설계

`page.tsx`의 원문 블록:

```tsx
{job.descriptionRaw ? (
  <div className={styles.rawSection}>
    <div className={styles.rawTitle}>공고 원문</div>
    <StackMarkdown className={styles.rawBody}>
      {mendEmphasis(job.descriptionRaw)}
    </StackMarkdown>
  </div>
) : null}
```

글자 수 주석("글자 수는 원문의 것을 세고…")은 글자 수를 지우므로 함께 지운다.
`.rawSection`의 위 경계선과 여백, `.rawBody`의 `margin-top`은 그대로 둔다 — 제목과 본문 사이 간격이 지금과 같다.
`.rawTitle`은 `display: flex` · `gap`도 필요 없어진다. 그 안에 제목 글자 하나만 남는다.

다른 절의 제목(`.blockTitle`, mono 작은 레이블)으로 바꾸지 않는다. 원문은 위쪽 절들과 달리
긴 본문이다. 지금의 큰 제목이 그 경계를 만든다.

## 완료 확인

- 요건이 뽑힌 공고의 상세를 열면 원문 본문이 처음부터 DOM에 보이고 `details` 요소가 페이지에 없다.
- "공고 원문" 제목의 computed `cursor`가 `auto`다.
- 제목 옆에 "자" · "아직 요건을" 문자열이 없다.
- `pnpm typecheck` · `pnpm test`가 통과한다.

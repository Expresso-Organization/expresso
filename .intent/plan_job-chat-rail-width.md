---
title: 공고 상세 채팅 레일 폭 채움 수정
slug: job-chat-rail-width
stage: plan
date: 2026-10-17
---

# Plan · 공고 상세 채팅 레일 폭 채움 수정

1. `services/web/src/app/(app)/jobs/[jobId]/page.module.css` `.railChat`에 `flex-direction: column`과
   이유 주석을 넣는다.
2. 미리보기 개발 서버(3121)에 같은 변경을 적용해 headless Chrome으로 잰다.
   - 1600×1000 · 레일 560px · 첫 화면: 채팅 루트 폭 = `.railChat` 폭
   - 1440×900 · 레일 316px · 첫 화면과 대화 화면: 같음
   - 1000×800: 채팅 높이 `min(720px, 85dvh)`, 가로 넘침 없음
3. `pnpm --filter @expresso/web typecheck` · `test`.
4. 커밋 → PR(base main) → CI 통과 → 머지 → 운영 배포 확인.

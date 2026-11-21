---
title: 「새 포트폴리오」를 대화로, 옛 단계 화면 걷어내기
slug: brew-chat-entry
stage: plan
date: 2026-11-21
---

# 구현 계획

1. 계약 — nullable `jobPostingId`, `brewId` 도구 입력, 새 도구 입력 · 재개 응답, 이벤트. 계약 테스트.
2. 백엔드 — `start_portfolio`(자료 밖 공고 · 분량), `start_free_portfolio`, `import_job_posting`, `openBrew`(인터뷰 · 생성 카드), `resumeBrew`, 생성 다시 만들기, 라우트(`POST /agent/brews/:brewId/resume`), 지침. 서비스 · 런타임 테스트.
3. 웹 — `/home?new=portfolio` 시작 화면, 진입 링크 교체, `/brew/[brewId]` 재개 페이지 · 옛 주소 넘기기, design 페이지는 카탈로그만, 카드의 자유 제작 모양 · 다시 만들기, 프록시 경로.
4. 걷어내기 — `/brew/new` · analyze · materials · counter와 그 화면만 쓰는 파일 · 테스트, 재사용 파일 이전.
5. 검사 — typecheck · test · test:infra, 실제 대화로 세 갈래 시작 · 이어서 만들기 · 다시 뽑기 확인, 커밋 · PR.

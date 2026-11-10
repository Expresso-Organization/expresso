---
title: 사이드바 관심 공고 일치도 표시 제거
slug: sidebar-interest-score
stage: plan
status: accepted
intent: .intent/intent_sidebar-interest-score.md
spec: .intent/spec_sidebar-interest-score.md
date: 2026-11-10
---

# 사이드바 관심 공고 일치도 표시 제거 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `services/web/src/components/shell/SidebarInterests.tsx` | 점수 · "분석 대기" 분기 삭제 |
| `services/web/src/components/shell/SidebarInterests.test.tsx` | 고정 데이터에서 `score` 삭제, 줄 끝 값이 없는지 확인 |
| `services/web/src/components/shell/Sidebar.tsx` | `SidebarInterest.score` 삭제 |
| `services/web/src/components/shell/AppChrome.tsx` | `score` 매핑과 주석 정리 |
| `services/web/src/components/shell/Sidebar.module.css` | `.score` · `.scoreHigh` · `.scoreMid` · `.pending` 삭제 |
| `docs/Expresso Screens.dc.html` | 관심 공고 줄 60개의 끝 `span` 삭제 |

## 작업 순서

1. 타입 · 매핑 · 컴포넌트 · CSS 수정 — `pnpm --filter @expresso/web typecheck` 통과
2. 테스트 수정 — `SidebarInterests.test.tsx` 통과
3. 정의서 수정 — 정규식이 60건을 지우고 `분석 대기` 0건
4. 화면 확인 — 개발 서버 `/home` 사이드바 스크린샷

## 가장 위험한 단계

3단계 정의서 일괄 치환. 패턴이 넓으면 다른 화면의 같은 라벨을 지운다. 라벨 + 바로 뒤 `span` + `</div>`로 좁히고 치환 건수를 확인한다. 어긋나면 `git checkout -- "docs/Expresso Screens.dc.html"`로 되돌린다.

## 검증

```
pnpm --filter @expresso/web typecheck
pnpm --filter @expresso/web test
grep -c "분석 대기" "docs/Expresso Screens.dc.html"   # 0
```

UI: `/home`을 열고 사이드바 관심 공고 줄 끝에 숫자 · "분석 대기"가 없는지, 헤더 건수가 있는지 본다.

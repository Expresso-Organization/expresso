# 경과

## 2026-11-23

### 17:40 · 이어받음 · 20261120-0230-expresso-ai-consultant
- 기획서 마일스톤 7 「포트폴리오 잇기」 가운데 「기록이 쌓였을 때」 시점을 맡음. 최종 발표(2026-12-01) 덱의 넷째 역할 문구가 이 기능을 전제로 함

### ~17:55 · T1 완료 · 기존 구현 없음 확인
- `platform/agent/runtime.ts`에 제작 시작 도구 세 개(`start_portfolio` · `start_free_portfolio` · `import_job_posting`, PR #268)는 있고, 먼저 제안하는 시점 판단은 없음
- 능동 제안(`proposals`)의 `start_portfolio` 행동은 공고 화면으로 가는 링크(`/jobs/<id>`)이고 유료 요금제에서만 돎. 대화 안 제작으로 이어지지 않음
- PR #152(P9~P12)는 옛 제작 화면 연결이고 제안 시점 판단이 없음

### ~18:10 · T2 완료 · 문서 커밋
- 31be3a56 intent, e8fbff10 spec, 9e50b906 plan

### 18:28 · T3~T6 완료 · 백엔드 구현
- 판단: 포트폴리오 0건 · 이 대화의 제작 0건 · 내용 있는 기록 3건 이상 · 마지막 제안에서 14일(`QUIET_DAYS`) 경과
- `pnpm --filter @expresso/backend typecheck` 통과, `pnpm --filter @expresso/backend test` 795 통과

### 18:33 · 발견 · 웹이 부품을 도구 이름으로 고름
- 로컬 대화에서 제안 도구는 불렸지만 단추가 보이지 않음. `tool-parts.tsx`의 선택지 항목이 이름 「선택지 질문」만 받음 → T7 추가

### 18:36 · 발견 · 수락 뒤 답변에 혼잣말과 제목 없는 시작
- 수락 직후 본문에 「사용자가 지원할 공고가 있는지부터 확인해야겠다」가 나오고, 「공고 없이 만들게요」 뒤 제목을 묻지 않고 제작을 시작함 → 지침 문단에 본문 예시와 「제목을 먼저 묻는다」를 더함

### 18:41 · T9 완료 · 로컬 확인
- 전용 DB `expresso_portfolio_suggest`, 워크트리의 백엔드(4047) · 웹(3147), 시험 계정(기록 2건 → 대화에서 3건째 저장)
- 경로 1: 세 번째 기록 저장 답변에 제안과 두 단추 → 「지금 만들어 볼게요」 → 시작 방식 선택지 → 「포트폴리오 제작」 카드
- 경로 2: 새 대화에서 「이제 뭘 하면 좋을까요?」 → 제안 → 수락 → 「공고 없이 만들게요」 → 제목 질문 → 답 → 「포트폴리오 제작」 카드
- 프로필에 `portfolioSuggestion.lastSuggestedOn: 2026-11-23` 기록 확인

### 19:00 · 완료 · 포트폴리오 잇기 — 기록이 쌓이면 컨설턴트가 먼저 제안
- 마지막 검증: `pnpm --filter @expresso/backend typecheck` · `test`, `pnpm --filter @expresso/web typecheck` · `test`, `pnpm test:infra`(결과는 PR 본문 초안에 적음)
- 남은 일은 전달(push · PR)뿐. 팀 레포라 사용자 결정을 기다림

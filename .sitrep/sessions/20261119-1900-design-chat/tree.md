# 작업 트리: 디자인 선택 단계의 채팅 전환
갱신 2026-11-19 19:55 · 진행률 95%

- [x] T1 화면 시안으로 구조 정하기
  - [x] T1.1 일곱 장면 × 두 배치 시안(저장해 둔 실제 생성 결과로)
  - [x] T1.2 배치 결정 반영: 흐름 기본, 큰 첫 화면을 누르면 무대
  - [x] T1.3 견본 누르기 → 대화가 이어지게(사용자 지적)
- [x] T2 기획 · 설계: intent · spec · plan (`design-chat`)
- [x] T3 AI 호출 네 가지와 실제 측정 (`page/design-chat/prompts.ts`)
- [x] T4 고른 첫 화면 뒤 이어 쓰기 (`briefed-generator.ts` · `stream.ts` · `LivePreview.tsx`)
- [x] T5 계약과 컬렉션 (`contracts/design-chat.ts` · 마이그레이션 0033)
- [x] T6 대화 서비스와 라우트 (`page/design-chat/service.ts` · `routes.ts`)
- [x] T7 생성 요청 연결 (`designSnippetId`)
- [x] T8 웹 대화 화면 (`features/design-chat/`) · 시안 라우트 제거
- [x] T9 실제 화면 검증: 첫 질문 → 견본 누르기 → 말로 고치기 → 넓게 보기 → 고르기 → 만들기
- [x] T10 테스트와 전체 검사
- [~] T11 커밋 · 푸시 · PR ← 현재

## 열린 결정
- D1 PR 머지: 머지하면 운영에 배포되고 마이그레이션 0033이 돈다. 사용자가 정함

범례: [x] 완료 · [~] 진행 중 · [?] 결정 대기 · [!] 막힘 · [ ] 예정 · [-] 폐기

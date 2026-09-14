---
status: accepted
---
# 구현 순서
1. packages/contracts/agent-chat 및 packages/database 마이그레이션: 대화/실행 계약과 인덱스.
2. backend/platform/agent 및 modules/agent-chat: Claude SDK, 도메인 도구, 소유권, 스트리밍, 취소, 변경 승인.
3. web/features/agent-chat: 프레임워크 기반 공유 UI, 대화 목록, 문맥 표시와 페이지 간 이동.
4. 공고/커리어 화면과 셸에 연결하고 별도 채팅 탭 제공.
5. 타입·단위·실제 MongoDB/Redis 검사, 브라우저에서 이어가기/복원/승인/취소 확인.
6. 변경 파일만 커밋·푸시. 기존 main 작업과 프레임워크 원본은 보존.
실행 복구는 메시지와 실행 상태의 서버 저장을 기준으로 한다. 종료된 모델 프로세스의 자동 재실행은 하지 않고 중단 상태로 복원한다.
검증: pnpm typecheck, pnpm test, pnpm test:infra 및 공통 채팅 브라우저 검증.

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

## 구현 중 확정
- 서버가 저장한 전체 상태를 SSE로 전달한다. 초기 구현에서는 MongoDB 상태 조회를 재사용해 재연결 시 중복 델타를 방지한다. Redis는 기존 인프라 검증 대상이며 채팅 이벤트의 별도 저장소로 추가하지 않았다.
- 대화당 100개 메시지, 입력 8,000자, 출력 64,000자, 턴당 8단계/600초/$1 한도를 둔다.
- 프레임워크 thread.aui 구성을 제품 토큰으로 옮기고 ExternalStoreRuntime에 연결했다. core 0.3.18의 assistant-cloud 불일치로 프레임워크와 같은 core 0.3.17을 고정했다.
- 기록 변경 도구는 SDK가 구조화 명령을 만들어 기존 CareerDocumentService의 검증/제안/적용 경로를 사용한다.
- test/support/agent-chat-preview.ts는 별도 DB와 검증 계정만 사용한다. AGENT_CHAT_LIVE=1이면 실제 Claude 실행 어댑터로 검증한다.

- 사용자 검토 후 자체 구성한 채팅 메시지·입력창을 제거했다. 프레임워크 원본 Thread 및 의존 컴포넌트 21개를 직접 이식하고, 원본 파일별 출처를 framework-manifest.json에 기록한다. UI 문구·제품 테마 변수·도메인 승인 슬롯만 연결한다.

## 검증 결과
- 전체 타입 검사 및 웹/백엔드 빌드 통과.
- 공통 채팅 집중 테스트: 백엔드 8개, 프론트엔드/BFF 5개 통과.
- 백엔드 전체 테스트 308개 통과, 인프라 테스트 205개 통과(환경 조건에 따른 skip 별도).
- 웹 전체 205개 통과. PropertyValueEditor의 기존 숫자 오류 문구 테스트 1개 실패: 변경 전 main에서도 같은 오류를 재현했다.
- 실제 Claude 로그인으로 일반 응답, 공고 문맥, 커리어 기록 변경 제안/적용/되돌리기, 실행 중지와 새로고침 복원을 브라우저에서 확인했다.
- 프레임워크 원본 /chat과 실제 화면을 비교했다. 이식한 21개 중 19개는 원본과 동일하고 2개는 문구/기능 가드만 수정했다.
- 검증 미리보기: http://127.0.0.1:3110/agent (별도 expresso_agent_chat_preview DB). 운영 활성화는 마이그레이션 후 AGENT_CHAT_ENABLED=1과 Claude 인증 설정이 필요하다.

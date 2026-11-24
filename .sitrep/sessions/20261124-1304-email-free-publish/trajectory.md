# 포트폴리오 배포 메일 인증 해제

## 2026-11-24

### 13:04 · 시작 · 별도 작업
- 최신 main에서 codex/email-free-publish 워크트리 생성
- 사용자 요청: 포트폴리오 웹사이트 배포의 메일 인증 제한 해제
- 운영 재현: 미인증 계정·없는 포트폴리오에 POST 시 403 email_verification_required, 확인용 세션 삭제
- pnpm typecheck 통과
- 웹 기본 병렬 테스트: CheckinFeed 1개 실패, 단독 9개 통과, maxWorkers=4 전체 592개 통과

### 13:05 · 완료 · 포트폴리오 배포 메일 인증 해제
- pnpm typecheck 통과
- pnpm test: 패키지 단위 검사 통과, 웹 CheckinFeed 1개 실패 후 maxWorkers=4 전체 592개 통과
- pnpm test:infra: 441개 통과·133개 생략·다른 기능 2개 5초 시간 초과
- 인증·배포 및 시간 초과한 2개 파일을 maxWorkers=1로 재실행: 4개 파일 49개 테스트 통과
- 미인증 계정 HTTP 배포·재배포 201, 공개 조회 200, 비로그인 401, 다른 소유자 404, emailVerifiedAt 유지 검증
- 계정·인증 완료 화면과 인증 메일의 배포 조건 안내 정리
- 전달 단계: 브랜치 push, PR 검사·머지, 운영 배포·API 비교 확인

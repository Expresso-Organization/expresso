# 작업 이력

## 2026-11-20

### 14:50 · 시작 · 배포 흐름 개선
- 사용자 요청: 편집에서 배포, 재배포, 공개 중단까지 이어지는 화면 개선

### ~15:10 · T1 발견 · 배포 흐름 문제
- 「열어 보기」가 공개 주소가 아니라 앱 안 `/site/{주소}`를 엶
- 「공개 중단」 · 「되돌리기」가 확인 없이 바로 실행됨
- 공개 중단 뒤 같은 판으로 다시 여는 길 없음(서버 되돌리기는 지원)
- 헤더 배포 단추가 진행 중에도 눌림, 편집 화면 단추는 늘 「배포하기」

### ~15:20 · T7 막힘 · 공용 로컬 DB
- `expresso` DB가 main 스키마보다 뒤처져 가입 실패(careerCategories 검증기)
- 2026-10-27 실패한 마이그레이션의 만료된 잠금 삭제 후 `db:migrate` 재시도 → 0006 체크섬 불일치로 거절. 공용 DB는 더 손대지 않음
- 대안: 같은 서버의 새 DB `expresso_publish_flow`에 마이그레이션 0033까지 적용, `QUEUE_PREFIX=publish-flow`로 큐 분리

### 15:30 · T2 완료 · 아티팩트
- 커밋 3298b5e4 intent, 5f148e0b spec, 8233db54 plan

### ~15:45 · T6 완료 · 구현과 검증
- `lib/publish-state.ts`, `DeployPanel.tsx`, `deploy-actions.ts`, `page.tsx`, `Editor.tsx`, `page.module.css`
- web typecheck 통과, vitest 92파일 495개 통과(새 10개), 운영 빌드 통과
- 공개 중단해도 `currentDeploymentId`가 남아 `deployment` · `isCurrent`가 유지됨을 서버 코드에서 확인

### ~16:00 · T7.2 막힘 · 생성 작업 대기
- 생성 작업 `15f71f9a`가 150초 넘게 `queued`. 원인 확인 중

### ~16:10 · T7.2 폐기 · 브라우저 지면 생성 경로
- 시도: 자유 제작 → 디자인 선택에서 fixture 생성. 생성 작업이 앞선 `recipe.draft`(동의 전 실패)를 기다리며 `queued`에 머묾
- 폐기 이유: 이번 변경과 무관한 생성 경로. 대안: `publishing/mongodb.integration.test.ts`의 `createPortfolio` 절차로 격리 DB에 시드

### ~16:25 · T7.4 완료 · 브라우저 확인
- v1 배포 → 상태 머리 「공개 중 v1」, 알림 링크, 「열기」가 `http://flow-check.site.localhost:3199/`, 공개 주소 200
- 판 추가 → 편집 화면 「v1 · 배포 후 변경됨」 · 「다시 배포」, 배포 화면 경고색 머리 → v2 배포
- v1 되돌리기 확인 창 → 확인 → v1 공개 중. 공개 중단 확인 창 → 확인 → 공개 주소 404, 주소 취소선, 「다시 공개」
- 다시 공개 → 공개 주소가 v1 내용, 판 수 2 그대로
- 375px: 본문 가로 넘침(408px) 발견 → `.slugInput` 수정 후 375px
- 「복사」: 이 창은 `clipboard-write` 거절 → 실패 문구 확인, 성공은 단위 테스트로 확인

### 16:30 · 완료 · 편집에서 배포 · 재배포 · 공개 중단까지 이어지는 배포 흐름
- web typecheck, vitest, 운영 빌드 통과. 남은 일은 push · PR · 머지

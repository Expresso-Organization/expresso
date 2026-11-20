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

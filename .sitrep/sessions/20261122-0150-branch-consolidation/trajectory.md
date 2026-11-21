# 작업 이력

## 2026-11-22
### 01:53 · T1 완료 · 백업·정리
- 백업: /Users/minjaepark/Backups/expresso-local-branches-20261122-015312
- Git bundle 검증 뒤 로컬 브랜치 6개와 워크트리 4개 삭제
### 01:57 · T3~T5 구현
- 링크 출처 계약과 read_link를 최신 제작·작업물 도구에 통합
- 중복 사설 주소 검사를 공용 public-url로 합치고 응답 본문에도 타임아웃 유지
- 공고 요건 추출 기본 off·사용량 계측 유지
- 개발 전용 /dev/branch-review에서 검색·표·추이 상태 비교
### 02:01 · T6 발견 · 초기 검증 조정
- 새 요건 추출 테스트의 계약명을 실제 job_facts로 정정
- 직접 vitest 실행 전 workspace database dist 빌드 필요 확인. 루트 검증 순서로 전환

### 02:10 · 범위 확정 · 선별 기능 승인
- 사용자가 검색·경력 테이블·추이 차트 선별안을 제품에 반영하도록 승인함
- 최신 main의 제작 도구와 편집기를 유지하며 세 기능을 연결함
### 02:24 · 완료 · 로컬 브랜치 정리와 승인 기능 통합
- pnpm typecheck, pnpm test 통과: 계약 156 · 렌더러 76 · 백엔드 786 · 웹 584개 통과함
- pnpm test:infra: Mongo/Redis 통합 431개 통과, 환경별 133개 건너뜀
- NEXT_DIST_DIR=.next-build pnpm --filter @expresso/web build 통과함
- 설치된 Chrome으로 Playwright 경력·검색 5개 통과, 추가 모바일·Reduce Motion 확인 2개 통과함
- 1440·390px 비교 페이지와 실제 추이 렌더링의 오버플로 없음, 키보드·Reduce Motion·콘솔 오류 없음 확인함
- 운영 빌드의 /dev/branch-review가 404임을 확인함
- 백업 14개 경로의 inode·크기·수정 시각과 6개 ref·4개 워크트리 삭제 상태를 재검증함
- 실제 Claude/Codex AI 호출은 수행하지 않음. 주입한 응답으로 생성·인용 검증 경로를 확인함

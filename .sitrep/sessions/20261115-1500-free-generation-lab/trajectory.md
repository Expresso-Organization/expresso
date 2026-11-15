# Trajectory: 자유 생성 파이프라인 실험

## 2026-11-15

### ~15:00 · 시작 · 자유 생성 실험 요청
- 요청: 구조화 생성은 그대로 두고, 자유 생성 + 정제된 컨텍스트 + 웹사이트 디자인 스킬을 적용했을 때 결과물이 더 나은지 실험
- 워크트리 `.worktree/free-generation-lab`, 브랜치 `feat/free-generation-lab`(origin/main 98f3a2e7 기준)

### ~15:40 · T1 완료 · intent · spec · plan
- 커밋: 5de7685b · 6150d33f · bdc79cc2
- 결정(에이전트): 정제된 컨텍스트 = 원문에서 사실을 뽑은 정리본, 디자인 스킬 = `frontend-design`(Apache-2.0), 모델 등급 Sonnet 고정, 제품 경로에는 연결하지 않음
- 결정(에이전트): 입력은 가상 프로필 `content.json`이 아니라 DB 복사본의 더미 계정 생성 문맥. 가상 프로필은 이미 정리된 자료이고 수치가 없어 원문 대 정리본 비교가 성립하지 않음

### 16:00 · T2 완료 · 생성기
- 파일: `services/backend/src/modules/page/generator.ts`(내보내기 · 요청 조립 세 함수 분리), `page-brief.ts`, `briefed-generator.ts`
- 테스트: `page-brief.test.ts` 8개 · `briefed-generator.test.ts` 6개 통과, 기존 생성기 테스트 3개 파일 통과, 백엔드 `tsc --noEmit` 통과
- 확인: 요청 조립을 나누기 전후의 프롬프트 해시가 네 가지 입력에서 같음

### ~16:00 · 발견 · 소독기가 지운 태그를 기록하지 않음
- `sanitizePage`의 `removed`는 속성 · 주소만 남기고 `<script>` 같은 태그는 남기지 않음
- 대응: 모델이 쓴 `script` · `iframe` · `form` 수를 `blockedTags`로 따로 셈. spec의 함정 항목 수정

### 16:05 · 보고 · 구현 중 25%
- 전달: 생성기 구현과 테스트 완료, 다음은 입력 준비
- 결정 요청: 없음

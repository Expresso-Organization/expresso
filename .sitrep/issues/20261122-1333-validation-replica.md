# 격리 MongoDB의 replica set 이름과 준비 검사 불일치
- 세션: 20261122-1315-match-release-readiness (T4)
- 문제: 시험 DB를 `matchValidation`으로 만들자 제품 준비 검사의 `rs0` 조건에 걸려 API 준비 대기가 만료됨.
- 해결 방안: 직접 만든 시험 컨테이너만 `rs0`으로 다시 만들고 57177 포트·별도 DB·`directConnection`으로 격리 유지.
- 사용자 기여: 없음 · 에이전트 단독 해결
- 결과: 실제 제품의 준비 검사 통과 후 전체 임베딩 준비와 인증 API 검증 진행.

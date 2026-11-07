# Spec: 포트폴리오 병렬 생성

- 큐: `generation-jobs`를 추가하고 `queueNameFor(jobName)`이 작업 이름을 큐로 고른다. `domain-jobs` 처리기의 `portfolio.generate` 분기는 배포 시점에 이미 줄에 있던 작업을 위해 남긴다.
- 설정: `WORKER_CONCURRENCY`(1~16, 기본 3). `generation-jobs`, `domain-jobs`, `page-refine`에 적용한다. `career-jobs`는 AI를 쓰지 않아 기존 4를 유지한다.
- 종료: 새 워커와 큐를 기존 종료 절차에 넣는다. 잡을 처리하던 워커의 `close`가 끝날 때까지 기다리는 동작은 그대로다.
- 공유 상태: AI 클라이언트 · 생성기는 호출 중 인스턴스 상태를 바꾸지 않는다. 측정 브라우저는 측정마다 context를 연다. 변경하지 않는다.
- 동시 분석: 같은 공고의 요건 저장은 `job_postings` 쓰기 충돌로 직렬화되는지 통합 시험으로 확인한다.

Open questions: 구독 사용량 한도에 닿는 동시 수는 문서로 확인할 수 없어 운영에서 실측한다. 한도에 닿으면 기본값을 낮춘다.

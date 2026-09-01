# 커리어 편집기 출처 기록

SynapseNote 기준 커밋은 `3729f003d252b7d2817fe04a1a87b23635eb5f68`이다. Expresso의
편집기 코어는 해당 동작을 참고해 독립적으로 재구현하며 원본 코드·주석·fixture를
복사하지 않는다. `packages/app/src/editor/*`는 behavioral-reference로만 분류한다.

`database/schema.ts`, `relation.ts`, `rollup.ts`, `formula*.ts`는 이 저장소의
`@expresso/editor`와 후속 계산 모듈에서 owned-port로 새로 작성한다. 원본 작성자,
라이선스와 사용자의 작성 권리는 기준 커밋의 저장소 기록을 확인한 범위에서 검토했고,
파일별 저작권 조사는 수행하지 않는다.

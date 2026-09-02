# 커리어 편집기 출처 기록

SynapseNote 기준 커밋은 `3729f003d252b7d2817fe04a1a87b23635eb5f68`이다. Expresso의
편집기 코어는 해당 제품 동작과 구조를 참고해 독립적으로 재구현하며 원본 코드·주석·
fixture를 복사하지 않는다.

| 참고 범위 | Expresso 구현 | 사용 방식 |
| --- | --- | --- |
| 블록 편집 동작 | `packages/editor/src/document.ts`, `commands.ts` | 동작을 확인하고 중립 명령 모델로 재작성 |
| 수식 문법·계산 동작 | `packages/editor/src/formula/*` | 동작을 확인하고 UUID 참조와 제한 실행기로 재작성 |
| 롤업 집계 동작 | `packages/editor/src/rollup.ts` | 집계 결과를 확인하고 Expresso 값 계약으로 재작성 |
| 관계·저장 구조 | `services/backend/src/modules/career/*` | 제품 경계를 참고하고 MongoDB 원장 구조로 재작성 |

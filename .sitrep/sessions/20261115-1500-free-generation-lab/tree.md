# 작업 트리: 자유 생성 파이프라인 실험
갱신 2026-11-17 12:40 · 진행률 100%

- [x] T1 기획 · 설계: intent · spec · plan
- [x] T2 생성기
  - [x] T2.1 요청 조립 분리와 내보내기 (`generator.ts`)
  - [x] T2.2 자료 정리본 (`page-brief.ts`)
  - [x] T2.3 두 스위치 생성기 (`briefed-generator.ts`)
  - [x] T2.4 스타일 전달 방식 `styleMode`(grammar · tokens · spec)
- [x] T3 입력: DB 복사본 `expresso_free_lab`에서 가상 인물 세 명의 생성 문맥
- [x] T4 시험 실행: 윤하린 × 다섯 조건(결과 폐기)
- [x] T5 전체 실행: 30칸, 실패 0
- [x] T6 측정 · 비교 화면
- [x] T7 눈가림 평가: 품질 3 · 다양성 1
- [x] T8 결과 문서
- [x] T7.1 배치 자유 반복 3건과 다양성 2차 평가
- [x] T9 검증 · 푸시 · PR
- [x] T10 제품 연결(D1 결정: 연결)
  - [x] T10.1 intent · spec · plan (`free-generation-wiring`)
  - [x] T10.2 계약: 스타일 문법 `kit` · `pageDocument()` · `partialFields()`
  - [x] T10.3 디자인 지침 내장과 `freePageGenerator`, API · Worker 조립 교체
  - [x] T10.4 CSS 먼저 출력 순서 확인(5건 재생성)
  - [x] T10.5 제품 화면 검증: 생성 중 미리보기 · 편집 화면 · 새 탭 미리보기
  - [x] T10.6 지시 편집 경로(정제 생략 · 디자인 유지)와 사용량 합산
  - [x] T10.7 검사 · 문서 · 커밋 · 푸시 · PR 갱신

## 열린 결정
- 없음

범례: [x] 완료 · [~] 진행 중 · [?] 결정 대기 · [!] 막힘 · [ ] 예정 · [-] 폐기

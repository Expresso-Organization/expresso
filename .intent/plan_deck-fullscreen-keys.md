# 전체화면 키 입력 긴급 수정
status: accepted

## 작업 순서
1. docs/최종-발표-개정.html 재생 호스트의 포커스를 차단한다.
2. scripts/verify-deck-keyboard.cjs에 브라우저 회귀 검증을 추가한다.
3. 배포본과 수정본의 실제 전체화면 단계 이동을 비교한다.

## 위험과 복구
녹화 화면의 입력 차단이 범위다. 실제 발표 컨트롤은 호스트 밖에 있다. 문제 발생 시 수정 커밋을 되돌린다.

## 검증 명령
node scripts/verify-deck-keyboard.cjs

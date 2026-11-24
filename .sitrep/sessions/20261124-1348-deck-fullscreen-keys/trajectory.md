# 작업 기록
- 배포본: 녹화 focus 이벤트로 activeElement가 IFRAME으로 변경되고 방향키 6회에도 1단계에 머묾.
- 수정: RX_OPTS에 triggerFocus: false. 새 재생기와 되감기 재생기에 공통 적용.
- inert 호스트 적용만으로는 3단계에서 포커스 탈취가 재발하여 폐기함.
- Chromium 일반·Reduce Motion 전체화면 회귀 검증 모두 통과, pageerror 0건.
- 포털 iframe 전체화면에서 2~8단계 방향키 진행 및 BODY 포커스 유지 확인.
- 전체 앱 검사 결과는 /tmp/expresso-hotfix-typecheck.log 및 /tmp/expresso-hotfix-test.log에 기록.
- 완료: 구현·로컬 검증 완료. 전달·배포 확인 진행.

# 녹화 재생 화면 포커스 격리
status: accepted

## 요구사항
녹화된 iframe 안의 녹화 focus 이벤트가 발표 키 입력을 가져가지 않는다. 원래 단계 재생과 전환을 유지한다.

## 설계
최종-발표-개정.html의 공유 재생 옵션 RX_OPTS에 triggerFocus: false를 설정한다. 녹화 화면은 사용자 입력 대상이 아니며 바깥 설명과 컨트롤은 유지한다.

## 검증
배포본 재현 후 실제 Chromium 전체화면에서 방향키, 역방향, 연속 입력과 단계 재생을 확인한다.

## 근거
[rrweb 공식 가이드](https://github.com/rrweb-io/rrweb/blob/main/guide.md)의 triggerFocus 옵션과 저장소에 포함된 rrweb.js의 Focus 이벤트 처리를 확인했다.

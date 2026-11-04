# 구현 순서

1. CoreDNS 파일과 Compose, Python Certbot 훅, 설치 스크립트 및 운영 절차 작성.
2. 동시 토큰·개별 cleanup·serial 증가·입력 제한을 집중 검증. DNS 구성만 바뀌면 전용 CI를 실행한다.
3. DNS 화면에 위임 레코드를 준비하고, 현재 인스턴스 전용 53번 개방과 NS 위임을 실행 시점에 확인받는다.
4. 외부 UDP/TCP 확인 후 레코드 적용, 훅 설치, staging 갱신과 cleanup을 확인한다.
5. 필수 CI 통과 후 main 머지, 운영 결과와 rollback을 기록한다.

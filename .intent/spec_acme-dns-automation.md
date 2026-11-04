# 요구사항

- `_acme-challenge.expresso.ai.kr`만 권한 위임한다. NS 대상은 `acme-dns.expresso.ai.kr`이며 기존 wildcard A가 서버로 해석된다.
- CoreDNS 고정 이미지, 비재귀 응답, 메모리 64MB와 CPU 0.25 제한을 적용한다.
- 인증 훅은 해당 도메인과 base64url 토큰만 허용한다. 여러 동시 토큰 보존, 잠금, atomic replace, 단조 증가 SOA serial을 사용한다.
- cleanup은 해당 토큰만 제거한다. 기존 manual hook 경로와 갱신 timer를 재사용한다.
- 전용 OCI NSG는 현재 인스턴스에만 TCP/UDP 53을 추가한다. 다른 VNIC와 공통 보안 목록은 수정하지 않는다.
- 계정/API 비밀은 소스나 채팅에 기록하지 않는다. 원복은 NS 위임 제거, 예전 TXT·훅 복원, 전용 NSG 분리다.

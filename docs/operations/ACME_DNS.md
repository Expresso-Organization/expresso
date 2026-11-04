# 와일드카드 인증서 DNS 자동 갱신

`_acme-challenge.expresso.ai.kr`을 공식 acme-dns 공개 서비스의 전용 CNAME으로 연결해 Certbot 갱신을 자동화한다.

## 권한과 승인

현재 호스팅케이알 화면은 A/CNAME/MX/SRV/TXT 유형만 제공한다. 인증용 CNAME 변경은 acme-dns 운영자에게 이 도메인의 TLS 인증 응답 권한을 준다. 외부 제공자 장애 시 갱신이 지연될 수 있다. 이 권한을 실제 변경 시점에 확인받은 뒤 등록·연결한다.

API 등록 시 업데이트 허용 IP는 서버 공인 IP `140.245.74.246/32`로 제한한다. 반환된 키는 `/etc/expresso-acme-dns.json`에 root 소유·0600으로 보관한다. 키를 소스·채팅·로그에 출력하지 않는다. 서비스 주소는 `https://auth.acme-dns.io`로 고정한다.

## 적용

1. 승인 후 서버에서 `/register`에 `allowfrom`을 지정해 전용 기록과 키를 만든다. 이미 키가 있으면 새로 등록하지 않는다.
2. 기존 `_acme-challenge` TXT 값과 TTL을 보관한다. 해당 레코드만 CNAME, 값은 등록 결과의 `fulldomain`, TTL 300으로 변경한다.
3. 서버의 main 포함 커밋에서 `sudo scripts/operations/install-acme-dns.sh`를 실행한다. 기존 manual 훅은 날짜별 `/var/backups/expresso-acme-*`에 보관한다.
4. `certbot renew --cert-name expresso.ai.kr-wildcard --dry-run --non-interactive --no-random-sleep-on-renew`가 성공하는지 확인한다. 기존 유효 인증서를 강제 재발급하지 않는다.
5. 기존 `snap.certbot.renew.timer`가 활성화돼 있음을 확인한다. 새 timer는 추가하지 않는다.

acme-dns는 최근 두 검증값을 유지해 apex와 wildcard 도전을 함께 처리한다. 검증값은 공개 DNS 값이며 cleanup에서 다른 도전의 값을 덮어쓰지 않는다. 훅은 고정 HTTPS 주소·입력 검증·리다이렉트 차단·전파 확인을 적용한다.

## 원복

기존 TXT 유형·값·TTL을 복원하고 백업한 auth.sh·cleanup.sh를 원래 경로로 돌린다. 기존 인증서와 키는 보존한다. 검사용 CoreDNS 컨테이너와 이미지는 제거했으며 OCI 방화벽은 변경하지 않았다.

## 근거

- [공식 acme-dns API와 권한](https://github.com/acme-dns/acme-dns)
- [Let's Encrypt DNS 위임](https://letsencrypt.org/docs/challenge-types/)
- [Certbot manual 훅](https://eff-certbot.readthedocs.io/en/stable/using.html#pre-and-post-validation-hooks)

# 와일드카드 인증서 DNS 자동 갱신

`_acme-challenge.expresso.ai.kr`을 공식 acme-dns 공개 서비스의 전용 CNAME으로 연결해 Certbot 갱신을 자동화한다.

## 권한과 승인

현재 호스팅케이알 화면은 A/CNAME/MX/SRV/TXT 유형만 제공한다. 인증용 CNAME 변경은 acme-dns 운영자에게 이 도메인의 TLS 인증 응답 권한을 준다. 외부 제공자 장애 시 갱신이 지연될 수 있다. 이 권한을 실제 변경 시점에 확인받은 뒤 등록·연결한다.

API 등록 시 업데이트 허용 IP는 서버 공인 IP `140.245.74.246/32`로 제한한다. 반환된 키는 `/etc/expresso-acme-dns.json`에 root 소유·0600으로 보관한다. 키를 소스·채팅·로그에 출력하지 않는다. 서비스 주소는 `https://auth.acme-dns.io`로 고정한다.

## 적용

1. 승인 후 서버에서 `/register`에 `allowfrom`을 지정해 전용 기록과 키를 만든다. 이미 키가 있으면 새로 등록하지 않는다.
2. 기존 `_acme-challenge` TXT 값과 TTL을 보관한다. 해당 레코드만 CNAME, 값은 등록 결과의 `fulldomain`, TTL 300으로 변경한다.
3. 서버의 main 포함 커밋에서 `sudo scripts/operations/install-acme-dns.sh`를 실행한다. 기존 manual 훅은 날짜별 `/var/backups/expresso-acme-*`에 보관한다.
4. 먼저 [인증기관 상태](https://letsencrypt.status.io/)를 확인한다. staging 점검 중에는 dry-run을 반복하지 않는다. 정상 상태에서 `certbot renew --cert-name expresso.ai.kr-wildcard --dry-run --non-interactive --no-random-sleep-on-renew`를 한 번 수행한다. 운영 인증 검사를 별도로 수행할 경우 새 DNS 검증인지 확인하고, 이미 유효한 과거 인증의 재사용을 성공 근거로 삼지 않는다. 기존 유효 인증서를 강제 재발급하지 않는다.
5. 기존 `snap.certbot.renew.timer`가 활성화돼 있음을 확인한다. 새 timer는 추가하지 않는다.

acme-dns는 최근 두 검증값을 유지해 apex와 wildcard 도전을 함께 처리한다. 검증값은 공개 DNS 값이며 cleanup에서 다른 도전의 값을 덮어쓰지 않는다. 훅은 고정 HTTPS 주소·입력 검증·리다이렉트 차단·전파 확인을 적용한다.

## 원복

기존 TXT 유형·값·TTL을 복원하고 백업한 auth.sh·cleanup.sh를 원래 경로로 돌린다. 기존 인증서와 키는 보존한다. 검사용 CoreDNS 컨테이너와 이미지는 제거했으며 OCI 방화벽은 변경하지 않았다.

## 근거

- [공식 acme-dns API와 권한](https://github.com/acme-dns/acme-dns)
- [Let's Encrypt DNS 위임](https://letsencrypt.org/docs/challenge-types/)
- [Certbot manual 훅](https://eff-certbot.readthedocs.io/en/stable/using.html#pre-and-post-validation-hooks)

## 운영 연결 기록

2026-11-04 사용자 승인 후 인증 레코드 한 개를 전용 CNAME에 연결했다. 대상은 `45043145-1ffb-4fa2-9c8f-1b5263cd429a.auth.acme-dns.io`, TTL은 300이다. 웹 서비스 A 레코드는 유지했다.

서버 IP 제한 등록과 root 소유 0600 키 파일을 확인했고 갱신 훅을 기존 경로에 설치했다. 기존 인증서 serial과 만료일을 유지했다. 원래 TXT 설정은 `/var/backups/expresso-acme-dns-before.json`, 원래 훅은 날짜별 백업에 있다.

권한 DNS 4곳, Cloudflare·Google·Quad9 및 인증 DNS의 UDP/TCP 응답을 확인했다. 실제 CA 검증 결과는 [운영 이슈](https://github.com/DigestWorks/LawDigest/issues/240)에서 추적한다. DNS 조회 성공과 인증기관 검증 성공은 각각 확인한다.

## 이전 결과 — 2026-11-04 오후 원복

실제 staging 갱신은 총 3회 실패했다. 처음에는 TXT 조회 timeout, 전파 확인 후에는 SERVFAIL, 마지막 오류 이후 5분 30초가 지난 재시도에서도 timeout이었다. 권한 DNS 4곳, Cloudflare·Google·Quad9, 외부 인증 DNS UDP/TCP 및 부모 glue 응답은 확인됐지만 CA 검증은 통과하지 못했다. 원인을 로컬 훅이나 특정 제공자로 단정하지 않는다.

자동 갱신 완료로 처리하지 않고 기존 TXT 값·TTL 3600과 원래 수동 auth/cleanup 훅을 복원했다. 운영 인증서 serial·만료일은 동일하며 웹은 HTTP 200이다. 현재 운영은 수동 DNS 인증 방식이다.

사용하지 않는 전용 키는 `/var/backups/expresso-acme-20261104154056/acme-dns-unused.json`으로 옮겼다. `/etc/expresso-acme-dns.json`이 없어 설치 스크립트가 무심코 재활성화하지 못한다. 검증용 전체 소스 워크트리도 제거했다. 기존 갱신 timer는 유지한다.

증거는 서버 `/tmp/expresso-acme-staging-final.log`, `expresso-acme-staging-retry.log`, `expresso-acme-staging-after-cache.log`이며 후속 판단은 [운영 이슈](https://github.com/DigestWorks/LawDigest/issues/240)에 남긴다. 재시도는 DNS 검증 경로의 변경이나 외부 상태 변화 근거가 있을 때 수행한다.


## 현재 운영 상태 — 2026-11-04 재진단

사용자의 원인 조사·해결 요청에 따라 승인된 동일 CNAME과 기존 IP 제한 키·자동 훅을 다시 연결했다. 인증서 자동 갱신의 최종 확인은 아직 남아 있다.

[Let’s Encrypt 공식 점검 공지](https://letsencrypt.status.io/pages/maintenance/55957a99e800baa4470002da/6ae128f23dbbeb05d762175d)는 2026-11-03 16:00~11-04 21:00 UTC, 한국 시간 11-04 01:00~11-05 06:00의 데이터센터 점검을 명시한다. staging 중단과 클라이언트 지연을 예고했고, 11-04 06:26 UTC에는 staging 복구가 진행 중이라고 알렸다. 오후 세 차례의 실패와 22:19 KST 재확인 실패 모두 이 구간에 해당한다. 점검으로 인한 시험 환경 DNS 장애가 유력하지만 개별 TXT timeout의 내부 원인은 공개 공지만으로 확정할 수 없다.

이번 진단은 다음 차이를 확인했다.

- 미국·유럽·아시아 외부 측정 지점에서 호스팅케이알 권한 서버와 인증 DNS 서버가 응답했다. 전 세계 접근 불가 현상은 재현되지 않았다.
- 루프백에만 바인딩한 임시 Unbound에서 캐시 없는 전체 재귀 조회와 DNSSEC 검증 조회 모두 CNAME·최신 TXT를 반환했다. 임시 프로세스는 각 실행 직후 종료했다.
- 일부 UDP 조회는 예전 TXT를 보였으나 TCP 조회에서는 최신 CNAME을 반환했다. 기존 수동 훅에도 UDP 중간 캐시 우회를 위한 TCP 사용 이유가 기록돼 있다. 이 응답만으로 권한 서버의 레코드 중복을 단정하지 않는다.
- staging dry-run 한 번은 같은 TXT timeout으로 실패했다. 동일 조건의 추가 재시도는 하지 않는다.
- 운영 wildcard 인증 확인은 이전의 valid authorization을 재사용했다. 새 DNS 검증이 아니므로 통과 근거에서 제외한다. 인증서 발급 단계는 호출하지 않았다.

기존 인증서 serial `06855F8F9ED64A93FB3B9C686E141334FC1A`, 만료 2027-01-26 00:30:38 KST, 웹 HTTP 200, 기존 `snap.certbot.renew.timer` active 상태를 확인했다. 웹 A 레코드는 그대로다. 활성 키는 `/etc/expresso-acme-dns.json` root 전용 0600이며, 재연결 직전 훅은 `/var/backups/expresso-acme-repair-20261104221916/`에 있다.

현재 남은 확인은 기존 권한을 비활성화하지 않는 `expresso.ai.kr` 운영 DNS 소유권 검사 1회다. 이 검사는 인증서 발급·교체를 하지 않는다. 자동 승인 검토가 별도 운영 주문·검증의 구체적 승인 부족으로 거절해 사용자 승인을 요청했다. 승인 전에는 수행하지 않는다. 대안은 공식 점검 종료 뒤 정상 상태에서 staging 검사를 한 번 수행하는 것이다.

추가 증거는 서버 `/tmp/expresso-acme-repair-staging.log`, `/tmp/expresso-dns-debug/unbound.log`, `/tmp/expresso-dns-debug/unbound-validator.log`, 로컬 `/tmp/expresso-production-dns-diagnostic.log`에 있다. 외부 측정 기록은 로컬 `/tmp/expresso-dns-{hosting,acmedns,global-trace}.json`에 보관했다. 최종 상태는 [운영 이슈](https://github.com/DigestWorks/LawDigest/issues/240)에 갱신한다.

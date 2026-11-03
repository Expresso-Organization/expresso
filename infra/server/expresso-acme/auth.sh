#!/bin/sh
# *.expresso.ai.kr 와일드카드 인증서의 DNS-01 확인 훅.
# hosting.co.kr DNS에는 API가 없어 TXT 레코드는 사람이 넣는다. 이 훅은 확인 값을
# value.txt에 적고, 네 권한 네임서버 모두에서 그 값이 보일 때까지 기다린다.
# 조회는 TCP로 한다. 이 서버의 UDP 53 응답은 중간 캐시가 가로채 새 레코드를 늦게 보여 준다.
# armed 파일이 없으면 바로 실패한다 — 자동 갱신 타이머가 한 시간씩 붙잡지 않게 한다.
set -u
DIR=/home/ubuntu/expresso-acme
[ -f "$DIR/armed" ] || { echo "armed 파일이 없어 수동 확인을 건너뜁니다" >&2; exit 1; }
echo "$CERTBOT_VALIDATION" > "$DIR/value.txt"
chmod 644 "$DIR/value.txt"
deadline=$(( $(date +%s) + 3600 ))
while [ "$(date +%s)" -lt "$deadline" ]; do
  seen=0
  for ns in ns1.hosting.co.kr ns2.hosting.co.kr ns3.hosting.co.kr ns4.hosting.co.kr; do
    dig +tcp +short TXT "_acme-challenge.$CERTBOT_DOMAIN" @"$ns" | grep -q -- "$CERTBOT_VALIDATION" && seen=$((seen + 1))
  done
  [ "$seen" -eq 4 ] && { sleep 30; exit 0; }
  sleep 15
done
echo "한 시간 안에 TXT 레코드가 보이지 않았습니다" >&2
exit 1

#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
[ "$(id -u)" -eq 0 ] || { echo 'root 권한이 필요합니다' >&2; exit 1; }
[ -s /etc/expresso-acme-dns.json ] || { echo '승인된 인증 DNS 등록을 먼저 완료하세요' >&2; exit 1; }
BACKUP_DIR="/var/backups/expresso-acme-$(date +%Y%m%d%H%M%S)"
install -d -m 700 "$BACKUP_DIR"
cp -a /home/ubuntu/expresso-acme/auth.sh /home/ubuntu/expresso-acme/cleanup.sh "$BACKUP_DIR/"
install -d -m 755 /usr/local/lib/expresso-acme
install -m 755 "$ROOT_DIR/scripts/operations/acme-dns-hook.py" /usr/local/lib/expresso-acme/dns_hook.py
cat > /home/ubuntu/expresso-acme/auth.sh <<'HOOK'
#!/bin/sh
exec /usr/bin/python3 /usr/local/lib/expresso-acme/dns_hook.py auth
HOOK
cat > /home/ubuntu/expresso-acme/cleanup.sh <<'HOOK'
#!/bin/sh
exec /usr/bin/python3 /usr/local/lib/expresso-acme/dns_hook.py cleanup
HOOK
chmod 755 /home/ubuntu/expresso-acme/auth.sh /home/ubuntu/expresso-acme/cleanup.sh

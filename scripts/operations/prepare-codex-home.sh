#!/usr/bin/env bash
#
# 우리 호출 전용 codex 홈을 만든다.
#
# 왜 가르나 — 사람이 쓰는 `~/.codex`에는 그 사람의 지침과 설정이 들어 있고,
# codex는 그걸 **매 호출 컨텍스트에 실어 보낸다.** 이 기계에서 실측한 값
# (2026-08-13): 최소 호출 하나가 입력 19,430토큰이었고 그중 4,260이
# `~/.codex/AGENTS.md`(17,961바이트)였다. 공고 본문에서 세 칸 읽는 일에
# 다른 프로젝트 지침이 실려 갈 이유가 없다.
#
# 토큰보다 중요한 것은 **재현성**이다. 지금 구조에서는 서버에서 그 파일을
# 고치면 우리 추출 결과가 조용히 달라진다.
#
# 인증은 심볼릭 링크로 건다. 복사하면 토큰이 갱신될 때 사본이 낡는다.
#
#   scripts/operations/prepare-codex-home.sh [대상경로]
set -euo pipefail

TARGET="${1:-$HOME/.codex-expresso}"
SOURCE="${CODEX_SOURCE_HOME:-$HOME/.codex}"

if [ ! -f "$SOURCE/auth.json" ]; then
  echo "인증을 찾을 수 없다: $SOURCE/auth.json" >&2
  echo "먼저 codex에 로그인한다." >&2
  exit 1
fi

mkdir -p "$TARGET"
ln -sfn "$SOURCE/auth.json" "$TARGET/auth.json"
chmod 700 "$TARGET"

echo "준비됨: $TARGET"
echo "  auth.json → $(readlink "$TARGET/auth.json")"
echo
echo "services/backend/.env 에 이 줄을 넣는다:"
echo "  CODEX_HOME=$TARGET"

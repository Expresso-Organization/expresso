#!/bin/sh
set -eu

keyfile=/run/mongodb/mongodb-keyfile
mkdir -p /run/mongodb

if [ -L "$keyfile" ]; then
  echo "MongoDB keyfile must not be a symbolic link" >&2
  exit 1
fi
if [ -e "$keyfile" ]; then
  if [ ! -f "$keyfile" ] || [ ! -s "$keyfile" ]; then
    echo "MongoDB keyfile path is not a non-empty file" >&2
    exit 1
  fi
else
  umask 177
  temporary=$(mktemp /run/mongodb/mongodb-keyfile.XXXXXX)
  trap 'rm -f "$temporary"' EXIT HUP INT TERM
  head -c 756 /dev/urandom | base64 >"$temporary"
  mv "$temporary" "$keyfile"
fi

length=$(tr -d '[:space:]' <"$keyfile" | wc -c)
if [ "$length" -lt 6 ] || [ "$length" -gt 1024 ] || grep -q '[^A-Za-z0-9+/=[:space:]]' "$keyfile"; then
  echo "MongoDB keyfile must contain 6-1024 base64 characters" >&2
  exit 1
fi
chown 999:999 "$keyfile"
chmod 400 "$keyfile"

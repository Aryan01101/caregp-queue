#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: bash scripts/check_live_connectivity.sh https://your-service.up.railway.app" >&2
  exit 2
fi

base_url="${1%/}"

if [[ "$base_url" != https://* ]]; then
  echo "Error: use the public HTTPS Railway domain." >&2
  exit 2
fi

if [[ "$base_url" == *".railway.internal"* ]]; then
  echo "Error: a railway.internal address is private. Generate a public domain in Railway first." >&2
  exit 2
fi

check() {
  local path="$1"
  printf '\nChecking %s%s\n' "$base_url" "$path"
  curl --fail --show-error --silent --connect-timeout 10 --max-time 20 \
    --write-out '\nHTTP %{http_code}\n' \
    "$base_url$path"
}

check "/"
check "/health/live"
check "/health/ready"
check "/webhooks/whatsapp"

printf '\nAll safe live-connectivity checks passed.\n'

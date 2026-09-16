#!/usr/bin/env bash
# Mint a LOCAL DEVELOPMENT RS256 JWT for the Fullstack Loop stack.
#
# The token is signed with the gitignored development key from gen-dev-keys.sh and is
# only ever accepted by a backend configured with the matching development public key.
# It is not a credential for anything real.
#
#   ./scripts/mint-dev-token.sh                      # read+write, 1 hour
#   ./scripts/mint-dev-token.sh --scope tasks:read   # read-only, to exercise 403
#   ./scripts/mint-dev-token.sh --expired            # already expired, to exercise 401
set -Eeuo pipefail

key="${LOOP_JWT_PRIVATE_KEY:-dev-keys/jwt-dev-private.pem}"
issuer="https://auth.fullstack-loop.local/"
audience="fullstack-loop-api"
subject="dev-user"
scope="tasks:read tasks:write"
lifetime=3600

while [[ $# -gt 0 ]]; do
  case "$1" in
    --scope)    scope="$2"; shift 2 ;;
    --subject)  subject="$2"; shift 2 ;;
    --lifetime) lifetime="$2"; shift 2 ;;
    --expired)  lifetime=-60; shift ;;
    --key)      key="$2"; shift 2 ;;
    -h|--help)  sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *)          echo "unknown argument: $1" >&2; exit 64 ;;
  esac
done

if [[ ! -r "$key" ]]; then
  echo "no readable private key at '$key' — run ./scripts/gen-dev-keys.sh first" >&2
  exit 2
fi

b64url() { openssl base64 -A | tr '+/' '-_' | tr -d '='; }

now="$(date +%s)"
header='{"alg":"RS256","typ":"JWT"}'
payload="$(printf '{"iss":"%s","aud":"%s","sub":"%s","scope":"%s","iat":%s,"exp":%s}' \
  "$issuer" "$audience" "$subject" "$scope" "$now" "$((now + lifetime))")"

signing_input="$(printf '%s' "$header" | b64url).$(printf '%s' "$payload" | b64url)"
signature="$(printf '%s' "$signing_input" \
  | openssl dgst -sha256 -sign "$key" -binary \
  | b64url)"

printf '%s.%s\n' "$signing_input" "$signature"

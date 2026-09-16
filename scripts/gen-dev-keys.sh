#!/usr/bin/env bash
# Generate the LOCAL DEVELOPMENT JWT keypair. Never used outside a dev machine.
set -Eeuo pipefail

out_dir="${1:-dev-keys}"
mkdir -p "$out_dir"

private_key="$out_dir/jwt-dev-private.pem"
public_key="$out_dir/jwt-dev-public.pem"

if [[ -e "$private_key" || -e "$public_key" ]]; then
  if [[ ! -r "$private_key" || ! -r "$public_key" ]]; then
    echo "incomplete keypair in $out_dir — refusing to overwrite partial state" >&2
    exit 1
  fi
  private_fingerprint="$(openssl pkey -in "$private_key" -pubout -outform DER 2>/dev/null | openssl dgst -sha256)"
  public_fingerprint="$(openssl pkey -pubin -in "$public_key" -pubout -outform DER 2>/dev/null | openssl dgst -sha256)"
  if [[ "$private_fingerprint" != "$public_fingerprint" ]]; then
    echo "private/public keys in $out_dir do not match — refusing to continue" >&2
    exit 1
  fi
  echo "matching keys already present in $out_dir — refusing to overwrite" >&2
  exit 0
fi

openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 \
  -out "$private_key" 2>/dev/null
openssl rsa -pubout -in "$private_key" \
  -out "$public_key" 2>/dev/null
# 0644, deliberately. This is a generated, gitignored, development-only key that is
# mounted read-only into the e2e container, which runs as its own uid. Mode 600 works
# on Docker Desktop only because its file-sharing layer ignores ownership; on a Linux
# CI host it would make the key unreadable and the auth journeys would fail with a
# permissions error that looks nothing like its cause. It signs nothing real.
chmod 644 "$private_key"

echo "wrote $out_dir/jwt-dev-private.pem (mint) and $out_dir/jwt-dev-public.pem (verify)"

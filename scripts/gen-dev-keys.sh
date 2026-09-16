#!/usr/bin/env bash
# Generate the LOCAL DEVELOPMENT JWT keypair. Never used outside a dev machine.
set -Eeuo pipefail

out_dir="${1:-dev-keys}"
mkdir -p "$out_dir"

if [[ -f "$out_dir/jwt-dev-private.pem" ]]; then
  echo "keys already present in $out_dir — refusing to overwrite" >&2
  exit 0
fi

openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 \
  -out "$out_dir/jwt-dev-private.pem" 2>/dev/null
openssl rsa -pubout -in "$out_dir/jwt-dev-private.pem" \
  -out "$out_dir/jwt-dev-public.pem" 2>/dev/null
# 0644, deliberately. This is a generated, gitignored, development-only key that is
# mounted read-only into the e2e container, which runs as its own uid. Mode 600 works
# on Docker Desktop only because its file-sharing layer ignores ownership; on a Linux
# CI host it would make the key unreadable and the auth journeys would fail with a
# permissions error that looks nothing like its cause. It signs nothing real.
chmod 644 "$out_dir/jwt-dev-private.pem"

echo "wrote $out_dir/jwt-dev-private.pem (mint) and $out_dir/jwt-dev-public.pem (verify)"

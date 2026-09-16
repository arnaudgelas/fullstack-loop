import { readFile } from 'node:fs/promises';
import { SignJWT, importPKCS8 } from 'jose';
import type { CryptoKey } from 'jose';

/**
 * Mints the RS256 bearer tokens this suite installs in the browser.
 *
 * Every value here is fixed by AUTH.md so the four components agree; none of
 * them is invented locally. The signing key is the DEVELOPMENT keypair written
 * by scripts/gen-dev-keys.sh -- gitignored, dockerignored, never baked into an
 * image, and bind-mounted into this container at run time.
 */
export const ISSUER = 'https://auth.fullstack-loop.local/';
export const AUDIENCE = 'fullstack-loop-api';
export const SCOPE_READ = 'tasks:read';
export const SCOPE_WRITE = 'tasks:write';
export const ALL_SCOPES = `${SCOPE_READ} ${SCOPE_WRITE}`;

// Where docker-compose.yml bind-mounts dev-keys/jwt-dev-private.pem for the
// e2e service. The /etc/loop/ prefix is unchanged by the project rename.
const DEFAULT_KEY_PATH = '/etc/loop/jwt-private.pem';
const ALGORITHM = 'RS256';

export function privateKeyPath(): string {
  return process.env['LOOP_JWT_PRIVATE_KEY_PATH'] ?? DEFAULT_KEY_PATH;
}

let cachedKey: Promise<CryptoKey> | null = null;

async function signingKey(): Promise<CryptoKey> {
  cachedKey ??= (async (): Promise<CryptoKey> => {
    const path = privateKeyPath();
    let pem: string;
    try {
      pem = await readFile(path, 'utf8');
    } catch (cause) {
      // Deliberately fatal, never a skip: under QUALITY-GATES.md an
      // unrunnable step is a failure, and a suite that quietly stops
      // authenticating would still "pass" against an unsecured backend.
      throw new Error(
        `Cannot read the dev JWT signing key at ${path}. ` +
          'Run scripts/gen-dev-keys.sh and bind-mount dev-keys/jwt-dev-private.pem ' +
          'to that path (env LOOP_JWT_PRIVATE_KEY_PATH overrides it).',
        { cause },
      );
    }
    return importPKCS8(pem, ALGORITHM);
  })();
  return cachedKey;
}

export interface TokenOptions {
  /** Space-delimited scopes. Defaults to both task scopes. */
  readonly scope?: string;
  /** Seconds until expiry. Negative values mint an already-expired token. */
  readonly lifetimeSeconds?: number;
  readonly issuer?: string;
  readonly audience?: string;
  readonly subject?: string;
}

/** Mints a signed RS256 JWT of the shape AUTH.md fixes. */
export async function mintToken(options: TokenOptions = {}): Promise<string> {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const lifetime = options.lifetimeSeconds ?? 300;
  const issuedAt = lifetime < 0 ? nowSeconds + lifetime - 60 : nowSeconds;

  return new SignJWT({ scope: options.scope ?? ALL_SCOPES })
    .setProtectedHeader({ alg: ALGORITHM, typ: 'JWT' })
    .setSubject(options.subject ?? 'e2e-deployment-check')
    .setIssuer(options.issuer ?? ISSUER)
    .setAudience(options.audience ?? AUDIENCE)
    .setIssuedAt(issuedAt)
    .setExpirationTime(nowSeconds + lifetime)
    .sign(await signingKey());
}

/**
 * A token whose `exp` is comfortably outside AUTH.md's 60s skew allowance, so
 * a provider that honours `exp` must reject it.
 */
export function mintExpiredToken(): Promise<string> {
  return mintToken({ lifetimeSeconds: -120 });
}

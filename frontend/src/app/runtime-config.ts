/**
 * Configuration that must vary per deployment and therefore cannot be baked
 * into the bundle: above all the bearer token.
 *
 * nginx renders `/config.json` from environment variables when the container
 * starts (see frontend/nginx.conf), so the image contains no token and the
 * JavaScript bundle contains no token.
 */
export interface RuntimeConfig {
  /** Base path handed to the generated client. Empty string = same origin. */
  readonly apiBasePath: string;
  /** Raw JWT, or `null` when the environment supplied none. */
  readonly token: string | null;
}

export const RUNTIME_CONFIG_URL = '/config.json';

const DEFAULT_CONFIG: RuntimeConfig = { apiBasePath: '', token: null };

function readString(source: Record<string, unknown>, key: string): string | null {
  const value = source[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** Narrows an untrusted JSON payload to a `RuntimeConfig`. */
export function parseRuntimeConfig(payload: unknown): RuntimeConfig {
  if (typeof payload !== 'object' || payload === null) {
    return DEFAULT_CONFIG;
  }
  const source = payload as Record<string, unknown>;
  return {
    apiBasePath: readString(source, 'apiBasePath') ?? DEFAULT_CONFIG.apiBasePath,
    token: readString(source, 'token'),
  };
}

/**
 * Fetches `/config.json` before bootstrap. A missing or unreadable file is not
 * fatal: the app boots without a token and the API answers 401, which is a
 * state the UI renders explicitly.
 */
export async function loadRuntimeConfig(fetchImpl: typeof fetch = fetch): Promise<RuntimeConfig> {
  try {
    const response = await fetchImpl(RUNTIME_CONFIG_URL, { cache: 'no-store' });
    if (!response.ok) {
      return DEFAULT_CONFIG;
    }
    return parseRuntimeConfig(await response.json());
  } catch {
    return DEFAULT_CONFIG;
  }
}

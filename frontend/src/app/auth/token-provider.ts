import type { EnvironmentProviders } from '@angular/core';
import { makeEnvironmentProviders } from '@angular/core';

/**
 * Source of the bearer token attached to every generated-client request.
 *
 * Abstract on purpose: it is the DI seam AUTH.md requires, so a component test
 * (or e2e) can substitute a provider without touching the interceptor.
 */
export abstract class TokenProvider {
  /** The current raw JWT, or `null` when the app has no credential. */
  abstract token(): string | null;
}

/** Trivial implementation over a token resolved once, at runtime. */
export class StaticTokenProvider extends TokenProvider {
  constructor(private readonly value: string | null) {
    super();
  }

  override token(): string | null {
    return this.value;
  }
}

/** Binds the abstract seam to a token obtained at runtime. */
export function provideToken(token: string | null): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: TokenProvider, useValue: new StaticTokenProvider(token) },
  ]);
}

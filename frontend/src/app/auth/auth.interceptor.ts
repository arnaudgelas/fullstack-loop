import type { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { TokenProvider } from './token-provider';

/**
 * Attaches `Authorization: Bearer <token>` to API requests.
 *
 * The contract declares `bearerAuth` at the root, so every `/api/**` call needs
 * it. Requests for the app's own runtime config are deliberately left alone —
 * that file is served by nginx, not by the authenticated backend.
 */
export const authInterceptor: HttpInterceptorFn = (request, next) => {
  if (!request.url.includes('/api/')) {
    return next(request);
  }

  const token = inject(TokenProvider).token();
  if (token === null || token === '') {
    // No credential: send the request unauthenticated and let the API answer
    // 401, so the "not signed in" state is driven by the contract rather than
    // guessed at in the client.
    return next(request);
  }

  return next(request.clone({ setHeaders: { Authorization: `Bearer ${token}` } }));
};

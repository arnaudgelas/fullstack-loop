import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import type { ApplicationConfig } from '@angular/core';
import { provideBrowserGlobalErrorListeners, provideZoneChangeDetection } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideApi } from './api/generated';
import { routes } from './app.routes';
import { authInterceptor } from './auth/auth.interceptor';
import { provideToken } from './auth/token-provider';
import type { RuntimeConfig } from './runtime-config';

/**
 * The contract's only server is `/`, so the generated client gets its base path
 * from runtime configuration and nothing absolute is baked into the bundle.
 * With the default (empty) base path requests go to `/api/tasks` and nginx
 * reverse-proxies them to `http://backend:8080`.
 */
export function buildAppConfig(config: RuntimeConfig): ApplicationConfig {
  return {
    providers: [
      provideBrowserGlobalErrorListeners(),
      provideZoneChangeDetection({ eventCoalescing: true }),
      provideRouter(routes, withComponentInputBinding()),
      provideHttpClient(withFetch(), withInterceptors([authInterceptor])),
      provideApi(config.apiBasePath),
      provideToken(config.token),
    ],
  };
}

import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { authInterceptor } from './auth.interceptor';
import { provideToken } from './token-provider';

function setup(token: string | null): { http: HttpClient; backend: HttpTestingController } {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withInterceptors([authInterceptor])),
      provideHttpClientTesting(),
      provideToken(token),
    ],
  });
  return {
    http: TestBed.inject(HttpClient),
    backend: TestBed.inject(HttpTestingController),
  };
}

describe('authInterceptor', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('attaches the bearer token to API requests', () => {
    const { http, backend } = setup('header.payload.signature');

    http.get('/api/tasks').subscribe();

    const request = backend.expectOne('/api/tasks');
    expect(request.request.headers.get('Authorization')).toBe('Bearer header.payload.signature');
    backend.verify();
  });

  it('sends no Authorization header when there is no token, so the API can answer 401', () => {
    const { http, backend } = setup(null);

    http.get('/api/tasks').subscribe();

    const request = backend.expectOne('/api/tasks');
    expect(request.request.headers.has('Authorization')).toBe(false);
    backend.verify();
  });

  it('treats an empty token as no token', () => {
    const { http, backend } = setup('');

    http.get('/api/tasks').subscribe();

    expect(backend.expectOne('/api/tasks').request.headers.has('Authorization')).toBe(false);
    backend.verify();
  });

  it('leaves non-API requests (such as the runtime config) untouched', () => {
    const { http, backend } = setup('header.payload.signature');

    http.get('/config.json').subscribe();

    expect(backend.expectOne('/config.json').request.headers.has('Authorization')).toBe(false);
    backend.verify();
  });

  it('works against an absolute API base path', () => {
    const { http, backend } = setup('abc.def.ghi');

    http.get('http://localhost:1234/api/tasks/7').subscribe();

    const request = backend.expectOne('http://localhost:1234/api/tasks/7');
    expect(request.request.headers.get('Authorization')).toBe('Bearer abc.def.ghi');
    backend.verify();
  });
});

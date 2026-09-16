import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { MatchersV3, PactV3 } from '@pact-foundation/pact';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { firstValueFrom } from 'rxjs';
import { afterEach, describe, expect, it } from 'vitest';
import type { Task } from '../../src/app/api/generated';
import { TasksService, provideApi } from '../../src/app/api/generated';
import { authInterceptor } from '../../src/app/auth/auth.interceptor';
import { provideToken } from '../../src/app/auth/token-provider';

const { boolean, eachLike, integer, like, regex, string } = MatchersV3;

const here = dirname(fileURLToPath(import.meta.url));

/**
 * The contract declares `bearerAuth` at the root, so every interaction carries
 * an Authorization header. It is matched on FORMAT — three base64url segments
 * behind `Bearer ` — and never on a literal value: a real token in a pact file
 * would be both a leaked secret and a guaranteed future breakage when it
 * expires. The example below is a structurally valid, unsigned placeholder.
 */
const BEARER_FORMAT = /^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const PLACEHOLDER_BEARER =
  'Bearer eyJhbGciOiJSUzI1NiJ9.eyJpc3MiOiJodHRwczovL2F1dGguZnVsbHN0YWNrLWxvb3AubG9jYWwvIiwiYXVkIjoiZnVsbHN0YWNrLWxvb3AtYXBpIn0.bm90LWEtc2lnbmF0dXJl';
const PLACEHOLDER_TOKEN = PLACEHOLDER_BEARER.slice('Bearer '.length);

const authorizationHeader = { Authorization: regex(BEARER_FORMAT, PLACEHOLDER_BEARER) };

const pact = new PactV3({
  consumer: 'fullstack-loop-frontend',
  provider: 'fullstack-loop-backend',
  dir: resolve(here, '../../pacts'),
  logLevel: 'warn',
});

/**
 * Builds the generated client exactly as the app does — same interceptor, same
 * TokenProvider seam — pointed at the pact mock server.
 */
function clientFor(baseUrl: string, token: string | null): TasksService {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withFetch(), withInterceptors([authInterceptor])),
      provideApi(baseUrl),
      provideToken(token),
    ],
  });
  return TestBed.inject(TasksService);
}

afterEach(() => {
  TestBed.resetTestingModule();
});

describe('fullstack-loop-frontend -> fullstack-loop-backend contract', () => {
  it('listTasks returns the stored tasks for an authenticated caller', async () => {
    await pact
      .given('two tasks exist')
      .uponReceiving('an authenticated request for all tasks')
      .withRequest({
        method: 'GET',
        path: '/api/tasks',
        headers: { Accept: 'application/json', ...authorizationHeader },
      })
      .willRespondWith({
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: eachLike({
          id: string('65f1c2d4e8a9b01234567890'),
          title: string('Write the failing acceptance scenario'),
          completed: boolean(false),
        }),
      })
      .executeTest(async (mockServer) => {
        const tasks = await firstValueFrom(
          clientFor(mockServer.url, PLACEHOLDER_TOKEN).listTasks(),
        );

        expect(tasks).toHaveLength(1);
        expect(tasks[0]).toEqual<Task>({
          id: '65f1c2d4e8a9b01234567890',
          title: 'Write the failing acceptance scenario',
          completed: false,
        });
      });
  });

  it('getTask returns a single task for an authenticated caller', async () => {
    await pact
      .given('a task with id 65f1c2d4e8a9b01234567890 exists')
      .uponReceiving('an authenticated request for that task')
      .withRequest({
        method: 'GET',
        path: '/api/tasks/65f1c2d4e8a9b01234567890',
        headers: { Accept: 'application/json', ...authorizationHeader },
      })
      .willRespondWith({
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: like({
          id: '65f1c2d4e8a9b01234567890',
          title: string('Write the failing acceptance scenario'),
          completed: boolean(false),
        }),
      })
      .executeTest(async (mockServer) => {
        const task = await firstValueFrom(
          clientFor(mockServer.url, PLACEHOLDER_TOKEN).getTask('65f1c2d4e8a9b01234567890'),
        );

        expect(task.id).toBe('65f1c2d4e8a9b01234567890');
        expect(task.completed).toBe(false);
      });
  });

  it('getTask surfaces a Problem for an unknown id', async () => {
    await pact
      .given('no task with id 000000000000000000000000 exists')
      .uponReceiving('an authenticated request for a missing task')
      .withRequest({
        method: 'GET',
        path: '/api/tasks/000000000000000000000000',
        headers: { Accept: 'application/json', ...authorizationHeader },
      })
      .willRespondWith({
        status: 404,
        headers: { 'Content-Type': 'application/json' },
        body: like({ status: integer(404), title: string('Task not found') }),
      })
      .executeTest(async (mockServer) => {
        await expect(
          firstValueFrom(
            clientFor(mockServer.url, PLACEHOLDER_TOKEN).getTask('000000000000000000000000'),
          ),
        ).rejects.toMatchObject({ status: 404 });
      });
  });

  it('listTasks answers 401 with a Problem body when no token is sent', async () => {
    await pact
      .given('the caller is unauthenticated')
      .uponReceiving('an unauthenticated request for all tasks')
      .withRequest({
        method: 'GET',
        path: '/api/tasks',
        headers: { Accept: 'application/json' },
      })
      .willRespondWith({
        status: 401,
        headers: { 'Content-Type': 'application/json' },
        body: like({ status: integer(401), title: string('Unauthorized') }),
      })
      .executeTest(async (mockServer) => {
        // No token: the interceptor omits the header, so the API decides.
        await expect(
          firstValueFrom(clientFor(mockServer.url, null).listTasks()),
        ).rejects.toMatchObject({ status: 401 });
      });
  });
});

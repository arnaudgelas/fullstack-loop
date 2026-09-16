// Throwaway verification double for the deployed Fullstack Loop stack.
//
// NOT part of the fullstack-loop-e2e image and NOT a mock the suite uses at runtime: the
// suite always runs against a real deployment. This server exists so the image
// itself can be proven -- that the browsers launch, that the journeys drive a
// real page, that the axe gate is not vacuous, and that the bearer-token path
// actually rejects a missing or expired token.
//
// It enforces auth the way AUTH.md fixes it: RS256 signature verified against
// dev-keys/jwt-dev-public.pem, plus iss, aud, exp and the per-method scope, and
// answers 401/403 with an RFC 7807 `Problem` body exactly as the contract says.
//
// Run it from the fullstack-loop-e2e image so `jose` resolves without a second
// install. Mount it UNDER /e2e: ESM resolves a bare specifier by walking up
// from the importing file, so /e2e/fixtures finds /e2e/node_modules while a
// mount at /fx does not (NODE_PATH is ignored for ESM).
//   docker run -d --network <net> --network-alias frontend \
//     -v "$PWD/e2e/fixtures:/e2e/fixtures:ro" -v "$PWD/dev-keys:/keys:ro" \
//     fullstack-loop-e2e node /e2e/fixtures/fixture-server.mjs
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { SignJWT, importPKCS8, importSPKI, jwtVerify } from 'jose';

const PORT = Number(process.env.PORT ?? '8080');
const PUBLIC_KEY_PATH = process.env.LOOP_JWT_PUBLIC_KEY_PATH ?? '/keys/jwt-dev-public.pem';
const ISSUER = 'https://auth.fullstack-loop.local/';
const AUDIENCE = 'fullstack-loop-api';

const page = readFileSync(new URL('./task-list-fixture.html', import.meta.url));
const publicKey = await importSPKI(readFileSync(PUBLIC_KEY_PATH, 'utf8'), 'RS256');

// FIXTURE_SELF_TOKEN=1 makes /config.json hand the browser a VALID token, the
// way a frontend container started with FULLSTACK_LOOP_FRONTEND_TOKEN does.
// It exists to prove a specific claim: that the suite's page.route() override
// of /config.json beats the application's own token source, so the 401 journey
// reproduces even against a frontend that was given a token.
// Deliberately NOT LOOP_JWT_PRIVATE_KEY_PATH: the image sets that to the
// suite's own mount point, and the double must not inherit it by accident.
const PRIVATE_KEY_PATH = process.env.FIXTURE_PRIVATE_KEY_PATH ?? '/keys/jwt-dev-private.pem';
const selfToken =
  process.env.FIXTURE_SELF_TOKEN === '1'
    ? await new SignJWT({ scope: 'tasks:read tasks:write' })
        .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
        .setSubject('fixture-self')
        .setIssuer(ISSUER)
        .setAudience(AUDIENCE)
        .setIssuedAt()
        .setExpirationTime('5m')
        .sign(await importPKCS8(readFileSync(PRIVATE_KEY_PATH, 'utf8'), 'RS256'))
    : null;

let nextId = 1;
const tasks = [];

const send = (res, status, body, headers = {}) => {
  res.writeHead(status, { 'content-type': 'application/json', ...headers });
  res.end(JSON.stringify(body));
};

const problem = (res, status, title, detail) =>
  send(
    res,
    status,
    { status, title, detail },
    status === 401 ? { 'www-authenticate': 'Bearer' } : {},
  );

/** Returns the verified scopes, or null after having answered 401/403. */
async function authorize(req, res, requiredScope) {
  const header = req.headers.authorization ?? '';
  const match = /^Bearer (\S+)$/.exec(header);
  if (match === null) {
    problem(res, 401, 'Unauthorized', 'No bearer token was presented.');
    return null;
  }
  let claims;
  try {
    // clockTolerance mirrors AUTH.md's 60s allowance -- no more.
    ({ payload: claims } = await jwtVerify(match[1], publicKey, {
      issuer: ISSUER,
      audience: AUDIENCE,
      clockTolerance: 60,
    }));
  } catch (error) {
    problem(res, 401, 'Unauthorized', `Token rejected: ${error.code ?? error.message}`);
    return null;
  }
  const scopes = String(claims.scope ?? '')
    .split(' ')
    .filter(Boolean);
  if (!scopes.includes(requiredScope)) {
    problem(res, 403, 'Forbidden', `Token lacks the ${requiredScope} scope.`);
    return null;
  }
  return scopes;
}

createServer((req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');

  if (pathname === '/healthz') {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('ok\n');
    return;
  }

  // Default runtime config. Every test overrides this via page.route(), which
  // is the point: the double must offer the same seam the real frontend does.
  if (pathname === '/config.json') {
    send(res, 200, { apiBasePath: '', token: selfToken });
    return;
  }

  if (pathname === '/api/tasks' && req.method === 'GET') {
    void authorize(req, res, 'tasks:read').then((scopes) => {
      if (scopes !== null) {
        send(res, 200, tasks);
      }
    });
    return;
  }

  if (pathname === '/api/tasks' && req.method === 'POST') {
    void authorize(req, res, 'tasks:write').then((scopes) => {
      if (scopes === null) {
        return;
      }
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        const title = JSON.parse(body).title;
        if (typeof title !== 'string' || title.length === 0 || title.length > 200) {
          problem(res, 400, 'Invalid task', 'title must be 1..200 characters.');
          return;
        }
        const task = { id: String(nextId++), title, completed: false };
        tasks.unshift(task);
        send(res, 201, task, { location: `/api/tasks/${task.id}` });
      });
    });
    return;
  }

  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(page);
}).listen(PORT, '0.0.0.0', () => {
  console.log(`fixture server on :${PORT}`);
});

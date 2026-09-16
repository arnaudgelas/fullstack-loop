# Authentication design — binding for every component

The contract declares `bearerAuth` (RS256 JWT) at the root, so **every** operation
requires a valid token. This file fixes the details so the four components agree.
Nobody invents their own variant.

## Token shape

    alg        RS256 (asymmetric — the provider never holds a signing key)
    iss        https://auth.fullstack-loop.local/
    aud        fullstack-loop-api
    exp        required and enforced (no clock-skew leniency beyond 60s)
    scope      space-delimited. "tasks:read" for GET, "tasks:write" for POST.

## Keys — generated, never committed

`scripts/gen-dev-keys.sh` writes a development keypair to `dev-keys/` (gitignored):

    dev-keys/jwt-dev-private.pem    used only to MINT dev/test tokens
    dev-keys/jwt-dev-public.pem     used by the backend to VERIFY

These are development keys. They are generated locally, never committed, and never
used anywhere real. In a deployed environment the backend instead points at the
identity provider's JWKS endpoint — the code path is the same, only configuration
differs.

## Backend (provider)

- `spring-boot-starter-oauth2-resource-server`, validating signature, `exp`, `iss`
  and `aud`. Configure via `spring.security.oauth2.resourceserver.jwt.public-key-location`
  (env `LOOP_JWT_PUBLIC_KEY_LOCATION`, default `file:/etc/loop/jwt-public.pem`), with
  `issuer-uri`/JWKS as the documented production alternative.
- Method or route authorization mapping `tasks:read` to the GETs and `tasks:write`
  to the POST, so **403 is genuinely reachable and must be tested**, not just 401.
- `/actuator/health` stays public. Everything under `/api/**` is authenticated.
- 401 and 403 responses MUST be `application/json` bodies matching the `Problem`
  schema, same as every other error. Spring's default empty 401 body violates the
  contract — override the `AuthenticationEntryPoint` and `AccessDeniedHandler`.
- Tests generate an ephemeral RSA keypair in-process and mint tokens for each case:
  valid, expired, wrong issuer, wrong audience, bad signature, missing scope.
  All six are required — an auth test suite that only checks the happy path is
  not a test suite.

## Frontend (consumer)

- An `HttpInterceptor` attaching `Authorization: Bearer <token>` to generated-client
  requests, sourced from an injectable `TokenProvider` so tests can substitute one.
- A 401 from the API must surface as a distinct, user-visible state, not a silent
  empty list. Component-test that.
- The dev token is supplied at runtime, never baked into the image.

## Pact

- Consumer interactions include the `Authorization` header (match on presence/format,
  never on a literal token value — a hard-coded token in a pact file is both a
  secret leak and a guaranteed future breakage).
- The provider verification test injects a freshly minted valid token via a pact
  request filter, and keeps a provider state for the unauthorized case.

## e2e

- Mints a token with the dev private key and installs it in the browser context
  before the journey starts.
- One journey asserts the authenticated happy path; one asserts that an
  unauthenticated/expired-token load produces the 401 state rather than a blank page.

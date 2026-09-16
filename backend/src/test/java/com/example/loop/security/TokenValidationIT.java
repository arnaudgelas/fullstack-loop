package com.example.loop.security;

import static org.assertj.core.api.Assertions.assertThat;

import com.example.loop.FullstackLoopBackendApplication;
import com.example.loop.support.JwtTestTokens;
import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;

/**
 * Token validation: five of the six cases AUTH.md requires, against the real
 * {@code NimbusJwtDecoder} rather than a stub.
 *
 * <p>Every rejection is asserted on the {@code Problem} body as well as the
 * status, because Spring Security's default 401 has an empty body and that
 * would silently violate the contract.
 */
@Tag("requires-docker")
@SpringBootTest(
        classes = FullstackLoopBackendApplication.class,
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class TokenValidationIT extends AuthTestSupport {

    @Test
    @DisplayName("case 1 of 6 — a valid token with tasks:read is accepted")
    void validTokenIsAccepted() {
        ResponseEntity<String> response = getTasksRaw(JwtTestTokens.valid(JwtTestTokens.SCOPE_READ));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        // The auth suites share one Mongo, so assert the shape of a successful
        // listing rather than its exact contents.
        assertThat(response.getBody()).startsWith("[");
    }

    @Test
    @DisplayName("case 2 of 6 — an expired token is 401 with a Problem body")
    void expiredTokenIsRejected() {
        assertUnauthorized(JwtTestTokens.expired());
    }

    @Test
    @DisplayName("case 3 of 6 — a token from the wrong issuer is 401 with a Problem body")
    void wrongIssuerIsRejected() {
        assertUnauthorized(JwtTestTokens.wrongIssuer());
    }

    @Test
    @DisplayName("case 4 of 6 — a token for the wrong audience is 401 with a Problem body")
    void wrongAudienceIsRejected() {
        assertUnauthorized(JwtTestTokens.wrongAudience());
    }

    @Test
    @DisplayName("case 5 of 6 — a token signed by an untrusted key is 401 with a Problem body")
    void badSignatureIsRejected() {
        assertUnauthorized(JwtTestTokens.badSignature());
    }

    @Test
    @DisplayName("no token at all is 401 with a Problem body and a WWW-Authenticate header")
    @SuppressWarnings("PMD.LawOfDemeter") // ResponseEntity exposes headers through this API.
    void missingTokenIsRejected() {
        ResponseEntity<Map<String, Object>> response = getTasks(null);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        assertThat(response.getHeaders().getFirst(HttpHeaders.WWW_AUTHENTICATE)).isEqualTo("Bearer");
        assertThat(response.getBody()).containsEntry("status", HttpStatus.UNAUTHORIZED.value());
    }

    @Test
    @DisplayName("a token with no audience claim at all is 401 with a Problem body")
    void missingAudienceIsRejected() {
        assertUnauthorized(JwtTestTokens.noAudience());
    }

    @Test
    @DisplayName("a structurally broken token is 401 with a Problem body")
    void malformedTokenIsRejected() {
        assertUnauthorized("not.a.jwt");
    }

    @SuppressWarnings("PMD.LawOfDemeter") // ResponseEntity exposes headers through this API.
    private void assertUnauthorized(String token) {
        ResponseEntity<Map<String, Object>> response = getTasks(token);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        assertThat(response.getHeaders().getContentType())
                .isNotNull()
                .matches(type -> type.isCompatibleWith(MediaType.APPLICATION_JSON));
        assertThat(response.getBody())
                .containsEntry("status", HttpStatus.UNAUTHORIZED.value())
                .containsEntry("title", "Unauthorized")
                .containsKey("detail");
    }
}

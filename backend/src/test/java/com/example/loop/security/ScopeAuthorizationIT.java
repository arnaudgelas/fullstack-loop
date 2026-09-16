package com.example.loop.security;

import static org.assertj.core.api.Assertions.assertThat;

import com.example.loop.FullstackLoopBackendApplication;
import com.example.loop.support.JwtTestTokens;
import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;

/**
 * Scope authorization: the sixth case AUTH.md requires, plus the routes that
 * must stay reachable without a token.
 *
 * <p>A token that authenticates correctly but lacks the scope must produce a
 * 403 with a Problem body, which is what makes {@code tasks:read} /
 * {@code tasks:write} more than decoration.
 */
@Tag("requires-docker")
@SpringBootTest(
        classes = FullstackLoopBackendApplication.class,
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class ScopeAuthorizationIT extends AuthTestSupport {

    @Test
    @DisplayName("case 6 of 6 — a valid token without tasks:write is 403 with a Problem body")
    void missingWriteScopeIsForbidden() {
        ResponseEntity<Map<String, Object>> response = post(JwtTestTokens.valid(JwtTestTokens.SCOPE_READ));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        assertThat(response.getHeaders().getContentType())
                .isNotNull()
                .matches(type -> type.isCompatibleWith(MediaType.APPLICATION_JSON));
        assertThat(response.getBody())
                .containsEntry("status", HttpStatus.FORBIDDEN.value())
                .containsEntry("title", "Forbidden")
                .containsKey("detail");
    }

    @Test
    @DisplayName("a token with only tasks:write may not list tasks")
    void writeScopeCannotRead() {
        ResponseEntity<Map<String, Object>> response = getTasks(JwtTestTokens.valid(JwtTestTokens.SCOPE_WRITE));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
    }

    @Test
    @DisplayName("a token carrying both scopes may create")
    void bothScopesMayCreate() {
        ResponseEntity<Map<String, Object>> response = post(JwtTestTokens.valid(JwtTestTokens.SCOPE_BOTH));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
    }

    @Test
    @DisplayName("the health endpoint stays public")
    void healthIsPublic() {
        ResponseEntity<String> response = rest().getForEntity("/actuator/health", String.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody()).contains("\"status\":\"UP\"");
    }

    // PMD's LooseCoupling wants MultiValueMap; HttpHeaders is Spring's own type.
    @SuppressWarnings("PMD.LooseCoupling")
    private ResponseEntity<Map<String, Object>> post(String token) {
        HttpHeaders headers = bearer(token);
        headers.setContentType(MediaType.APPLICATION_JSON);
        return rest().exchange(TASKS, HttpMethod.POST, new HttpEntity<>(NEW_TASK_JSON, headers), PROBLEM);
    }
}

package com.example.loop.security;

import com.example.loop.support.MongoTestcontainer;
import java.util.Map;
import org.jspecify.annotations.Nullable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;

/**
 * Shared plumbing for the authentication and authorization suites.
 *
 * <p>Both suites boot the same application against the same Testcontainers
 * Mongo, so Spring caches one context across them.
 */
public class AuthTestSupport extends MongoTestcontainer {

    /** Path of the task collection endpoint, used by every case here. */
    protected static final String TASKS = "/api/tasks";

    /** Body of a create request, used by the scope cases. */
    protected static final String NEW_TASK_JSON = "{\"title\":\"should not be created\"}";

    /** Deserializes a Problem payload without coupling the tests to the model. */
    protected static final ParameterizedTypeReference<Map<String, Object>> PROBLEM =
            new ParameterizedTypeReference<>() {};

    @Autowired
    private TestRestTemplate restTemplate;

    /**
     * Returns the template bound to the random server port.
     *
     * @return the configured REST template
     */
    protected final TestRestTemplate rest() {
        return restTemplate;
    }

    /**
     * Performs a GET against the task list and returns the body unparsed.
     *
     * <p>Used for the cases expected to succeed: a 200 carries a JSON array,
     * which will not deserialize into the Problem shape the rejection cases use.
     *
     * @param token the token to present
     * @return the raw response
     */
    protected final ResponseEntity<String> getTasksRaw(String token) {
        HttpEntity<Void> request = new HttpEntity<>(bearer(token));
        return restTemplate.exchange(TASKS, HttpMethod.GET, request, String.class);
    }

    /**
     * Performs a GET against the task list with the given bearer token.
     *
     * @param token the token to present, or {@code null} to send none
     * @return the raw response
     */
    protected final ResponseEntity<Map<String, Object>> getTasks(@Nullable String token) {
        HttpEntity<Void> request = token == null ? null : new HttpEntity<>(bearer(token));
        return restTemplate.exchange(TASKS, HttpMethod.GET, request, PROBLEM);
    }

    /**
     * Builds an Authorization header carrying the given token.
     *
     * @param token the raw token value
     * @return headers with the bearer token set
     */
    // PMD's LooseCoupling wants MultiValueMap here, but HttpHeaders is the type
    // Spring's own API takes and the only one exposing setBearerAuth.
    @SuppressWarnings("PMD.LooseCoupling")
    protected static HttpHeaders bearer(String token) {
        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(token);
        return headers;
    }
}

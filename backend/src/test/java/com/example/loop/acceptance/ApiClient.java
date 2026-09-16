package com.example.loop.acceptance;

import com.example.loop.support.JwtTestTokens;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;

/**
 * The only thing the step definitions are allowed to touch.
 *
 * <p>Keeping HTTP here means the steps read as business language, and the two
 * step classes share one client rather than duplicating header plumbing.
 */
@Component
public class ApiClient {

    /** The task collection endpoint. */
    public static final String TASKS = "/api/tasks";

    private static final ParameterizedTypeReference<Map<String, Object>> DOCUMENT =
            new ParameterizedTypeReference<>() {};

    private static final ParameterizedTypeReference<List<Map<String, Object>>> DOCUMENTS =
            new ParameterizedTypeReference<>() {};

    private final TestRestTemplate restTemplate;
    private final MongoTemplate mongoTemplate;

    @Autowired
    ApiClient(TestRestTemplate restTemplate, MongoTemplate mongoTemplate) {
        this.restTemplate = restTemplate;
        this.mongoTemplate = mongoTemplate;
    }

    /** Drops every collection, so a scenario starts from a known empty store. */
    public void wipeStore() {
        mongoTemplate.getCollectionNames().forEach(mongoTemplate::dropCollection);
    }

    /**
     * Creates a task as an authorized caller.
     *
     * @param title the title to capture
     * @return the raw response
     */
    // PMD's LooseCoupling wants MultiValueMap; HttpHeaders is Spring's own type.
    @SuppressWarnings("PMD.LooseCoupling")
    public ResponseEntity<Map<String, Object>> createTask(String title) {
        HttpHeaders headers = bearer(JwtTestTokens.SCOPE_WRITE);
        headers.setContentType(MediaType.APPLICATION_JSON);
        HttpEntity<String> request = new HttpEntity<>("{\"title\":\"" + title + "\"}", headers);
        return restTemplate.exchange(TASKS, HttpMethod.POST, request, DOCUMENT);
    }

    /**
     * Lists tasks as an authorized caller.
     *
     * @return the tasks currently stored, newest first
     */
    public List<Map<String, Object>> listTasks() {
        HttpEntity<Void> request = new HttpEntity<>(bearer(JwtTestTokens.SCOPE_READ));
        return restTemplate.exchange(TASKS, HttpMethod.GET, request, DOCUMENTS).getBody();
    }

    /**
     * Lists tasks with no credentials at all.
     *
     * @return the raw response, expected to be a 401 Problem
     */
    public ResponseEntity<Map<String, Object>> listTasksAnonymously() {
        return restTemplate.exchange(TASKS, HttpMethod.GET, null, DOCUMENT);
    }

    // PMD's LooseCoupling wants MultiValueMap; HttpHeaders is Spring's own type.
    @SuppressWarnings("PMD.LooseCoupling")
    private static HttpHeaders bearer(String scope) {
        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(JwtTestTokens.valid(scope));
        return headers;
    }
}

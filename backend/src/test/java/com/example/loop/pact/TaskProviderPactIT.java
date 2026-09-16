package com.example.loop.pact;

import au.com.dius.pact.provider.junit5.HttpTestTarget;
import au.com.dius.pact.provider.junit5.PactVerificationContext;
import au.com.dius.pact.provider.junit5.PactVerificationInvocationContextProvider;
import au.com.dius.pact.provider.junitsupport.Provider;
import au.com.dius.pact.provider.junitsupport.State;
import au.com.dius.pact.provider.junitsupport.loader.PactFolder;
import com.example.loop.FullstackLoopBackendApplication;
import com.example.loop.domain.Task;
import com.example.loop.domain.TaskRepository;
import com.example.loop.support.JwtTestTokens;
import com.example.loop.support.MongoTestcontainer;
import java.time.Instant;
import org.apache.hc.core5.http.HttpRequest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.TestTemplate;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.data.mongodb.core.MongoTemplate;

/**
 * PROVIDER PACT VERIFICATION — replays the Angular consumer's expectations
 * against the running provider.
 *
 * <p>The pact under {@code src/test/resources/pacts} is a byte-for-byte copy of
 * what the consumer publishes into {@code frontend/pacts/}. It is copied rather
 * than read across a directory boundary so the provider build never depends on
 * the consumer build having run first. Once a Pact Broker exists, swap
 * {@code @PactFolder("pacts")} for {@code @PactBroker(url = ...)} plus consumer
 * version selectors and delete the copy — nothing else in this test changes.
 *
 * <p>The provider name must match the consumer's {@code provider.name} exactly.
 * If it does not, pact-jvm finds no pact and the suite passes having verified
 * nothing, which is strictly worse than failing.
 */
@Tag("requires-docker")
@Provider("fullstack-loop-backend")
@PactFolder("pacts")
@SpringBootTest(
        classes = FullstackLoopBackendApplication.class,
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class TaskProviderPactIT extends MongoTestcontainer {

    private static final String AUTHORIZATION = "Authorization";
    private static final String EXISTING_ID = "65f1c2d4e8a9b01234567890";
    private static final Instant CREATED_AT = Instant.parse("2026-01-01T00:00:00Z");

    @LocalServerPort
    private int port;

    @Autowired
    private TaskRepository taskRepository;

    @Autowired
    private MongoTemplate mongoTemplate;

    @BeforeEach
    void setTarget(PactVerificationContext context) {
        context.setTarget(new HttpTestTarget("localhost", port));
    }

    /**
     * Verifies one interaction, swapping the pact's placeholder token for a real
     * one first.
     *
     * <p>pact-jvm's JUnit 5 extension has no {@code @TargetRequestFilter} — that
     * annotation belongs to the JUnit 4 runner and is ignored here. The
     * supported hook is an {@link HttpRequest} parameter on the test template,
     * which is the first point at which the prepared request actually exists.
     *
     * <p>Whether to inject is read off the interaction rather than from a flag
     * set by a provider state: the consumer's pact already records which
     * interactions carry an Authorization header, and the unauthenticated one
     * must stay unauthenticated or the 401 it asserts cannot be reproduced.
     *
     * @param context the verification context pact-jvm supplies
     * @param request the prepared request, about to be sent to the provider
     */
    @TestTemplate
    @ExtendWith(PactVerificationInvocationContextProvider.class)
    void verifyConsumerExpectations(PactVerificationContext context, HttpRequest request) {
        if (request.containsHeader(AUTHORIZATION)) {
            request.setHeader(AUTHORIZATION, "Bearer " + JwtTestTokens.valid(JwtTestTokens.SCOPE_BOTH));
        }
        context.verifyInteraction();
    }

    @State("two tasks exist")
    void twoTasksExist() {
        wipe();
        store(EXISTING_ID, "Write the failing acceptance scenario");
        store("65f1c2d4e8a9b01234567891", "Verify the provider against the consumer pact");
    }

    @State("a task with id 65f1c2d4e8a9b01234567890 exists")
    void thatTaskExists() {
        wipe();
        store(EXISTING_ID, "Write the failing acceptance scenario");
    }

    @State("no task with id 000000000000000000000000 exists")
    void thatTaskDoesNotExist() {
        wipe();
    }

    @State("the caller is unauthenticated")
    void theCallerIsUnauthenticated() {
        wipe();
    }

    private void wipe() {
        mongoTemplate.getCollectionNames().forEach(mongoTemplate::dropCollection);
    }

    private void store(String id, String title) {
        taskRepository.save(new Task(id, title, false, CREATED_AT));
    }
}

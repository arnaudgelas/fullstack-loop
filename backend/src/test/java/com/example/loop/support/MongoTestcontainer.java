package com.example.loop.support;

import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.MongoDBContainer;
import org.testcontainers.utility.DockerImageName;

/**
 * One MongoDB 8.0 container (pinned to 8.0.20) shared by every test class that extends this.
 * Reusing a single container keeps the fast loop fast; each test class still
 * starts from clean state by dropping its collections (see subclasses).
 */
// PMD reads "only static members" as "utility class, hide the constructor".
// This is the opposite: it is a base class test classes extend to share one
// container, so the constructor must stay visible to subclasses.
@SuppressWarnings("PMD.UseUtilityClass")
public class MongoTestcontainer {

    protected static final MongoDBContainer MONGO = new MongoDBContainer(DockerImageName.parse("mongo:8.0.20"));

    static {
        MONGO.start();
    }

    /** Extended by test classes; never instantiated directly. */
    protected MongoTestcontainer() {}

    @DynamicPropertySource
    static void mongoProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.data.mongodb.uri", () -> MONGO.getReplicaSetUrl("loop"));
        registry.add("spring.data.mongodb.database", () -> "loop");
        // Point the resource server at the ephemeral public key the tests mint
        // tokens against, instead of the mounted production key.
        registry.add(
                "spring.security.oauth2.resourceserver.jwt.public-key-location", EphemeralRsaKeys::publicKeyLocation);
    }
}

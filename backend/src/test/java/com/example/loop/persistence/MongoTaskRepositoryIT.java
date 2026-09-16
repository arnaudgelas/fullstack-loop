package com.example.loop.persistence;

import static org.assertj.core.api.Assertions.assertThat;

import com.example.loop.domain.Task;
import com.example.loop.domain.TaskRepository;
import com.example.loop.support.MongoTestcontainer;
import java.time.Instant;
import java.util.Objects;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.data.mongo.DataMongoTest;
import org.springframework.context.annotation.Import;
import org.springframework.data.mongodb.core.MongoTemplate;

/**
 * INTEGRATION RING — the real Mongo adapter against a real MongoDB 8.0.20 in
 * Testcontainers. Tagged {@code requires-docker}: surefire skips it, failsafe
 * (mvn verify) runs it. State is dropped before every test, so the class is
 * authoritative regardless of what ran before it.
 */
@Tag("requires-docker")
@DataMongoTest
@Import(MongoTaskRepository.class)
class MongoTaskRepositoryIT extends MongoTestcontainer {

    private static final Instant NOW = Instant.parse("2026-01-01T00:00:00Z");
    private static final Instant A_MINUTE_EARLIER = NOW.minusSeconds(60);
    private static final Instant TWO_MINUTES_EARLIER = NOW.minusSeconds(120);

    @Autowired
    private TaskRepository repository;

    @Autowired
    private MongoTemplate mongoTemplate;

    @BeforeEach
    void cleanState() {
        mongoTemplate.getCollectionNames().forEach(mongoTemplate::dropCollection);
    }

    @Test
    @DisplayName("saving assigns a Mongo identifier and the task round-trips")
    void savesAndReadsBack() {
        Task saved = repository.save(Task.pending("persist me", NOW));

        assertThat(saved.id()).isNotBlank();
        assertThat(repository.findById(Objects.requireNonNull(saved.id()))).contains(saved);
    }

    @Test
    @DisplayName("findAllNewestFirst orders by creation time descending")
    void ordersNewestFirst() {
        repository.save(Task.pending("oldest", TWO_MINUTES_EARLIER));
        repository.save(Task.pending("middle", A_MINUTE_EARLIER));
        repository.save(Task.pending("newest", NOW));

        assertThat(repository.findAllNewestFirst())
                .extracting(Task::title)
                .containsExactly("newest", "middle", "oldest");
    }

    @Test
    @DisplayName("an unknown identifier yields an empty optional")
    void unknownIdentifierIsEmpty() {
        assertThat(repository.findById("65f1c2d4e8a9b01234567890")).isEmpty();
    }
}

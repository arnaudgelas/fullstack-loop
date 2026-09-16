package com.example.loop.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Objects;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/** INNER RING — application service behaviour, no Spring context. */
class TaskServiceTest {

    private final MutableClock clock = new MutableClock(Instant.parse("2026-01-01T00:00:00Z"));
    private final TaskService service = new TaskService(new InMemoryTaskRepository(), clock);

    @Test
    @DisplayName("a created task is assigned an identifier and starts pending")
    void createAssignsIdentifier() {
        Task created = service.createTask("Write the failing acceptance scenario");

        assertThat(created.id()).isNotBlank();
        assertThat(created.completed()).isFalse();
    }

    @Test
    @DisplayName("tasks are listed newest first")
    void listsNewestFirst() {
        service.createTask("oldest");
        clock.advance(Duration.ofSeconds(1));
        service.createTask("newest");

        assertThat(service.listTasks()).extracting(Task::title).containsExactly("newest", "oldest");
    }

    @Test
    @DisplayName("an invalid title never reaches the repository")
    void rejectsInvalidTitle() {
        assertThatThrownBy(() -> service.createTask("")).isInstanceOf(InvalidTaskException.class);

        assertThat(service.listTasks()).isEmpty();
    }

    @Test
    @DisplayName("fetching a task that does not exist fails with TaskNotFoundException")
    void missingTaskThrows() {
        assertThatThrownBy(() -> service.getTask("nope"))
                .isInstanceOf(TaskNotFoundException.class)
                .hasMessageContaining("nope");
    }

    @Test
    @DisplayName("a stored task can be fetched back by its identifier")
    void fetchesStoredTask() {
        Task created = service.createTask("round trip");

        // requireNonNull, not a cast: a saved task without an id is a bug worth
        // failing on loudly, and it also tells NullAway what save() guarantees.
        assertThat(service.getTask(Objects.requireNonNull(created.id()))).isEqualTo(created);
    }

    private static final class MutableClock extends Clock {
        private Instant now;

        private MutableClock(Instant now) {
            super();
            this.now = now;
        }

        void advance(Duration amount) {
            now = now.plus(amount);
        }

        @Override
        public java.time.ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(java.time.ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return now;
        }
    }
}

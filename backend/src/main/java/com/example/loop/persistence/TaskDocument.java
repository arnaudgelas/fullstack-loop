package com.example.loop.persistence;

import com.example.loop.domain.Task;
import java.time.Instant;
import java.util.Objects;
import org.jspecify.annotations.Nullable;
import org.springframework.data.annotation.Id;
import org.springframework.data.annotation.PersistenceCreator;
import org.springframework.data.mongodb.core.mapping.Document;

/**
 * Mongo representation of a {@link Task}. Kept out of the domain on purpose.
 *
 * <p>No getters or setters: Spring Data MongoDB maps by field access, so adding
 * them would be ceremony that buys nothing and turn this into a data class.
 *
 * <p>Immutable, hydrated through the {@code @PersistenceCreator} constructor
 * rather than field-by-field. The reference fields are {@code @Nullable} because
 * that is the truth about a document read back from a store that cannot enforce
 * a schema; {@link #toDomain()} is the one place the invariants are
 * re-established, so nothing downstream has to wonder.
 */
@Document(collection = "tasks")
class TaskDocument {

    @Id
    private final @Nullable String id;

    private final @Nullable String title;
    private final boolean completed;
    private final @Nullable Instant createdAt;

    @PersistenceCreator
    TaskDocument(@Nullable String id, @Nullable String title, boolean completed, @Nullable Instant createdAt) {
        this.id = id;
        this.title = title;
        this.completed = completed;
        this.createdAt = createdAt;
    }

    static TaskDocument from(Task task) {
        return new TaskDocument(task.id(), task.title(), task.completed(), task.createdAt());
    }

    /**
     * Converts back to the domain, re-asserting the invariants the store cannot.
     *
     * @return the equivalent domain task
     */
    Task toDomain() {
        return new Task(
                id,
                Objects.requireNonNull(title, "stored task has no title"),
                completed,
                Objects.requireNonNull(createdAt, "stored task has no creation time"));
    }
}

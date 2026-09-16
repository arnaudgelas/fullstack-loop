package com.example.loop.domain;

import java.time.Instant;
import java.util.Objects;
import org.jspecify.annotations.Nullable;

/**
 * A unit of work tracked by the system.
 *
 * <p>Pure domain type: no Spring, no web and no persistence annotations. The
 * inner ring of the loop tests this directly with plain JUnit.
 *
 * @param id store-assigned identifier, {@code null} until the task is saved
 * @param title human-readable summary of the work, never blank
 * @param completed whether the task has been finished
 * @param createdAt when the task was captured
 */
public record Task(@Nullable String id, String title, boolean completed, Instant createdAt) {

    /** Longest title the contract accepts (NewTask.title maxLength). */
    public static final int MAX_TITLE_LENGTH = 200;

    /**
     * Checks the invariants every task must hold, however it was built.
     */
    public Task {
        Objects.requireNonNull(title, "title must not be null");
        Objects.requireNonNull(createdAt, "createdAt must not be null");
    }

    /**
     * Creates a not-yet-persisted, pending task.
     *
     * @param title the caller-supplied title; nullable because this is the
     *     boundary where unvalidated input is checked, and surrounding
     *     whitespace is stripped
     * @param createdAt the capture time to stamp on the task
     * @return a pending task with a {@code null} identifier
     * @throws InvalidTaskException if the title is blank or longer than
     *                              {@link #MAX_TITLE_LENGTH} characters
     */
    public static Task pending(@Nullable String title, Instant createdAt) {
        if (title == null || title.isBlank()) {
            throw new InvalidTaskException("Title must not be blank");
        }
        String trimmed = title.strip();
        if (trimmed.length() > MAX_TITLE_LENGTH) {
            throw new InvalidTaskException("Title must be at most " + MAX_TITLE_LENGTH + " characters");
        }
        return new Task(null, trimmed, false, createdAt);
    }

    /**
     * Returns a copy of this task carrying the store-assigned identifier.
     *
     * @param assignedId the identifier the store assigned
     * @return a copy of this task with that identifier
     */
    public Task withId(String assignedId) {
        return new Task(assignedId, title, completed, createdAt);
    }
}

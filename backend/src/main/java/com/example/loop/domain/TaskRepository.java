package com.example.loop.domain;

import java.util.List;
import java.util.Optional;

/**
 * Port the domain needs from the outside world. The Mongo adapter in
 * {@code com.example.loop.persistence} is one implementation; the inner-ring
 * unit tests use a trivial in-memory one.
 */
public interface TaskRepository {

    /**
     * Returns all tasks, most recently created first.
     *
     * @return every stored task, newest first, never {@code null}
     */
    List<Task> findAllNewestFirst();

    /**
     * Stores a task.
     *
     * @param task the task to store; its id may be {@code null}
     * @return the stored task, carrying the identifier the store assigned
     */
    Task save(Task task);

    /**
     * Looks a task up by identifier.
     *
     * @param id the identifier to look for
     * @return the task, or {@link Optional#empty()} if there is none
     */
    Optional<Task> findById(String id);
}

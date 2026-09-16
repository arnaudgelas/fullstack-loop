package com.example.loop.domain;

import java.time.Clock;
import java.util.List;

/**
 * Application service. Deliberately free of Spring-web types: it speaks only
 * domain language and throws domain exceptions, so the web adapter can be a
 * thin translation layer and the inner ring can test it without a container.
 */
public class TaskService {

    private final TaskRepository repository;
    private final Clock clock;

    /**
     * Creates the service.
     *
     * @param repository the storage port
     * @param clock the clock used to stamp creation times
     */
    public TaskService(TaskRepository repository, Clock clock) {
        this.repository = repository;
        this.clock = clock;
    }

    /**
     * Lists the stored tasks.
     *
     * @return every task, newest first
     */
    public List<Task> listTasks() {
        return repository.findAllNewestFirst();
    }

    /**
     * Creates a pending task.
     *
     * @param title the caller-supplied title
     * @return the stored task, with its assigned identifier
     * @throws InvalidTaskException if the title is blank or too long
     */
    public Task createTask(String title) {
        return repository.save(Task.pending(title, clock.instant()));
    }

    /**
     * Fetches a single task.
     *
     * @param id the identifier to look for
     * @return the task with that identifier
     * @throws TaskNotFoundException if no such task exists
     */
    public Task getTask(String id) {
        return repository.findById(id).orElseThrow(() -> new TaskNotFoundException(id));
    }
}

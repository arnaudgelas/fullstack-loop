package com.example.loop.domain;

/** Raised when no task exists with the requested identifier. */
public class TaskNotFoundException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    /**
     * Creates the exception.
     *
     * @param taskId the identifier that was not found
     */
    public TaskNotFoundException(String taskId) {
        super("No task exists with id " + taskId);
    }
}

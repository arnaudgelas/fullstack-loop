package com.example.loop.domain;

/** Raised when a caller supplies a task that violates the domain invariants. */
public class InvalidTaskException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    /**
     * Creates the exception.
     *
     * @param message which invariant was violated
     */
    public InvalidTaskException(String message) {
        super(message);
    }
}

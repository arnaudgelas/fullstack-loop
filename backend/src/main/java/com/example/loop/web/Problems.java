package com.example.loop.web;

import com.example.loop.api.model.Problem;
import org.jspecify.annotations.Nullable;
import org.springframework.http.HttpStatus;

/**
 * Single place where the contract's {@code Problem} payload is built, so every
 * error the service can emit — validation, not-found, authentication and
 * authorization — has exactly the same shape.
 */
final class Problems {

    private Problems() {}

    static Problem problem(HttpStatus status, String title, @Nullable String detail) {
        Problem problem = new Problem();
        problem.setStatus(status.value());
        problem.setTitle(title);
        problem.setDetail(detail);
        return problem;
    }
}

package com.example.loop.web;

import com.example.loop.api.model.Problem;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import org.jspecify.annotations.Nullable;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;

/**
 * Writes a {@link Problem} straight onto the servlet response.
 *
 * <p>Needed because the Spring Security filter chain rejects a request before
 * it ever reaches a controller, so {@code @RestControllerAdvice} never sees it.
 * Without this, Spring's default 401 is an empty body, which does not match the
 * {@code Problem} schema the contract promises for 401 and 403.
 */
@Component
class ProblemResponseWriter {

    private final ObjectMapper objectMapper;

    ProblemResponseWriter(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    void write(HttpServletResponse response, HttpStatus status, String title, @Nullable String detail)
            throws IOException {
        response.setStatus(status.value());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        objectMapper.writeValue(response.getOutputStream(), Problems.problem(status, title, detail));
    }
}

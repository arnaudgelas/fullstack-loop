package com.example.loop.web;

import com.example.loop.api.model.Problem;
import com.example.loop.domain.InvalidTaskException;
import com.example.loop.domain.TaskNotFoundException;
import org.jspecify.annotations.Nullable;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/**
 * Turns domain and binding failures into the contract's Problem schema. This is
 * the only place in the web layer that knows about HTTP status codes.
 */
@RestControllerAdvice
class ApiExceptionHandler {

    @ExceptionHandler(TaskNotFoundException.class)
    ResponseEntity<Problem> handleNotFound(TaskNotFoundException exception) {
        return problem(HttpStatus.NOT_FOUND, "Task not found", exception.getMessage());
    }

    @ExceptionHandler(InvalidTaskException.class)
    ResponseEntity<Problem> handleInvalidTask(InvalidTaskException exception) {
        return problem(HttpStatus.BAD_REQUEST, "Invalid task", exception.getMessage());
    }

    /** Bean-validation failures on the generated request model. */
    @ExceptionHandler(MethodArgumentNotValidException.class)
    ResponseEntity<Problem> handleValidation(MethodArgumentNotValidException exception) {
        String detail = exception.getBindingResult().getFieldErrors().stream()
                .findFirst()
                .map(error -> error.getField() + " " + error.getDefaultMessage())
                .orElse("The request body failed validation");
        return problem(HttpStatus.BAD_REQUEST, "Invalid task", detail);
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    ResponseEntity<Problem> handleUnreadable(HttpMessageNotReadableException exception) {
        return problem(HttpStatus.BAD_REQUEST, "Invalid task", "The request body could not be read");
    }

    private static ResponseEntity<Problem> problem(HttpStatus status, String title, @Nullable String detail) {
        return ResponseEntity.status(status)
                .contentType(MediaType.APPLICATION_JSON)
                .body(Problems.problem(status, title, detail));
    }
}

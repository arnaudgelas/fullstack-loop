package com.example.loop.web;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.stereotype.Component;

/**
 * Renders the contract's 401 as a {@code Problem} body instead of Spring
 * Security's default empty response.
 *
 * <p>The {@code WWW-Authenticate} header is kept because RFC 6750 requires it on
 * a 401 from a bearer-token resource server.
 */
@Component
class ProblemAuthenticationEntryPoint implements AuthenticationEntryPoint {

    private final ProblemResponseWriter writer;

    ProblemAuthenticationEntryPoint(ProblemResponseWriter writer) {
        this.writer = writer;
    }

    @Override
    public void commence(
            HttpServletRequest request, HttpServletResponse response, AuthenticationException authException)
            throws IOException {
        response.setHeader(HttpHeaders.WWW_AUTHENTICATE, "Bearer");
        writer.write(
                response,
                HttpStatus.UNAUTHORIZED,
                "Unauthorized",
                "A valid bearer token is required to call this endpoint");
    }
}

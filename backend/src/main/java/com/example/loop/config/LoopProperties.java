package com.example.loop.config;

import jakarta.validation.constraints.NotBlank;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

/**
 * The application's own configuration namespace.
 *
 * <p>{@code ignoreUnknownFields = false} together with {@code @Validated} is
 * what makes misconfiguration fail at startup rather than in production: a typo
 * such as {@code loop.jwt-issuar} refuses the context instead of being silently
 * ignored, and a blank value is rejected before the first request arrives.
 *
 * @param jwtIssuer the {@code iss} every accepted token must carry, as fixed by
 *     AUTH.md
 * @param jwtAudience the {@code aud} every accepted token must carry, as fixed
 *     by AUTH.md
 */
@Validated
@ConfigurationProperties(prefix = "loop", ignoreUnknownFields = false)
public record LoopProperties(
        @NotBlank String jwtIssuer, @NotBlank String jwtAudience) {}

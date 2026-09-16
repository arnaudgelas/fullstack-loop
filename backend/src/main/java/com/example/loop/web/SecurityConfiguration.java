package com.example.loop.web;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;

/**
 * Authentication and authorization for the HTTP adapter.
 *
 * <p>Auth is deliberately a web-adapter concern: nothing below this package
 * knows that tokens exist, and the ArchUnit rules keep it that way.
 *
 * <p>Token validation itself is configured declaratively in application.yaml
 * (see {@code spring.security.oauth2.resourceserver.jwt}); Spring Boot builds a
 * {@code NimbusJwtDecoder} that checks the RS256 signature against the
 * configured public key and applies the issuer and audience validators.
 */
@Configuration
@EnableWebSecurity
public class SecurityConfiguration {

    /** Scope required to read tasks, as fixed by AUTH.md. */
    private static final String SCOPE_READ = "SCOPE_tasks:read";

    /** Scope required to create tasks, as fixed by AUTH.md. */
    private static final String SCOPE_WRITE = "SCOPE_tasks:write";

    // HttpSecurity.build() declares `throws Exception`, so a @Bean method that
    // returns a SecurityFilterChain cannot avoid declaring it too. Catching it
    // instead is worse: Checkstyle's IllegalCatch rightly forbids catching bare
    // Exception, and swallowing a filter-chain build failure would hide a
    // misconfiguration until runtime.
    @SuppressWarnings("PMD.SignatureDeclareThrowsException")
    @Bean
    SecurityFilterChain securityFilterChain(
            HttpSecurity http,
            ProblemAuthenticationEntryPoint authenticationEntryPoint,
            ProblemAccessDeniedHandler accessDeniedHandler)
            throws Exception {
        return http
                // A bearer-token API holds no session and no browser-submitted
                // form, so there is no CSRF surface to protect and no session to
                // create.
                .csrf(AbstractHttpConfigurer::disable)
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(requests -> requests.requestMatchers("/actuator/health", "/actuator/health/**")
                        .permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/tasks", "/api/tasks/*")
                        .hasAuthority(SCOPE_READ)
                        .requestMatchers(HttpMethod.POST, "/api/tasks")
                        .hasAuthority(SCOPE_WRITE)
                        .anyRequest()
                        .authenticated())
                .oauth2ResourceServer(oauth2 -> oauth2.jwt(Customizer.withDefaults())
                        .authenticationEntryPoint(authenticationEntryPoint)
                        .accessDeniedHandler(accessDeniedHandler))
                .exceptionHandling(handling -> handling.authenticationEntryPoint(authenticationEntryPoint)
                        .accessDeniedHandler(accessDeniedHandler))
                .build();
    }
}

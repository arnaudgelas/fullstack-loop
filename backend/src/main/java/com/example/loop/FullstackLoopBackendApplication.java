package com.example.loop;

import com.example.loop.config.LoopProperties;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;

// PMD's UseUtilityClass wants a private constructor here, which is impossible:
// @SpringBootApplication implies @Configuration, Spring proxies it with CGLIB,
// and CGLIB cannot subclass a class whose only constructor is private.
// Checkstyle's HideUtilityClassConstructor is satisfied by the protected one.
/** Application entry point and root Spring Boot configuration. */
@SpringBootApplication
@EnableConfigurationProperties(LoopProperties.class)
@SuppressWarnings("PMD.UseUtilityClass")
public class FullstackLoopBackendApplication {

    /**
     * Protected rather than private: Spring proxies the {@code @Configuration}
     * that {@code @SpringBootApplication} implies, and CGLIB cannot subclass a
     * class whose only constructor is private.
     */
    protected FullstackLoopBackendApplication() {}

    /**
     * Starts the application.
     *
     * @param args command-line arguments handed to Spring Boot
     */
    public static void main(String[] args) {
        SpringApplication.run(FullstackLoopBackendApplication.class, args);
    }
}

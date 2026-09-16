package com.example.loop.config;

import com.example.loop.domain.TaskRepository;
import com.example.loop.domain.TaskService;
import java.time.Clock;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Wires the framework-free domain into the Spring context. The domain classes
 * carry no Spring annotations, so the wiring lives here instead.
 */
@Configuration
public class DomainConfiguration {

    @Bean
    Clock clock() {
        return Clock.systemUTC();
    }

    @Bean
    TaskService taskService(TaskRepository repository, Clock clock) {
        return new TaskService(repository, clock);
    }
}

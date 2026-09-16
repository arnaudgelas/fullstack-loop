package com.example.loop.web;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.BDDMockito.given;
import static org.mockito.BDDMockito.willThrow;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.example.loop.domain.InvalidTaskException;
import com.example.loop.domain.Task;
import com.example.loop.domain.TaskNotFoundException;
import com.example.loop.domain.TaskService;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

/**
 * MIDDLE RING — web slice, task behaviour. Only the web adapter is loaded and
 * the domain service is mocked, so this pins the HTTP contract and nothing else.
 *
 * <p>Authentication and authorization live in {@link TaskControllerAuthSliceTest}
 * so neither class grows into a grab bag.
 */
// A MockMvc test is written with static imports by design: spelling out
// MockMvcRequestBuilders/MockMvcResultMatchers at every call site makes the
// HTTP expectations markedly harder to read, which is the opposite of the point.
@SuppressWarnings("PMD.TooManyStaticImports")
@WebMvcTest(controllers = TaskController.class)
@Import({
    SecurityConfiguration.class,
    ProblemAuthenticationEntryPoint.class,
    ProblemAccessDeniedHandler.class,
    ProblemResponseWriter.class
})
class TaskControllerWebMvcTest {

    private static final String TASKS = "/api/tasks";
    private static final String TASK_ID = "abc123";
    private static final String JSON_STATUS = "$.status";
    private static final String JSON_TITLE = "$.title";
    private static final String JSON_DETAIL = "$.detail";
    private static final Instant NOW = Instant.parse("2026-01-01T00:00:00Z");
    private static final Instant A_MINUTE_EARLIER = NOW.minusSeconds(60);
    private static final String READ = "SCOPE_tasks:read";
    private static final String WRITE = "SCOPE_tasks:write";

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private TaskService taskService;

    /**
     * The real decoder needs a public key that the slice has no business
     * loading; the token itself is supplied by the jwt() post-processor, so this
     * bean only has to exist for the filter chain to be built.
     */
    @MockitoBean
    private JwtDecoder jwtDecoder;

    @Test
    @DisplayName("GET /api/tasks returns the tasks newest first")
    void listsTasks() throws Exception {
        given(taskService.listTasks())
                .willReturn(
                        List.of(new Task("2", "newest", false, NOW), new Task("1", "oldest", true, A_MINUTE_EARLIER)));

        mockMvc.perform(get(TASKS).with(jwt().authorities(authority(READ))))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$[0].id").value("2"))
                .andExpect(jsonPath("$[0].title").value("newest"))
                .andExpect(jsonPath("$[0].completed").value(false))
                .andExpect(jsonPath("$[1].id").value("1"))
                .andExpect(jsonPath("$[1].completed").value(true));
    }

    @Test
    @DisplayName("POST /api/tasks returns 201 with a Location header")
    void createsTask() throws Exception {
        given(taskService.createTask(eq("Write the failing acceptance scenario")))
                .willReturn(new Task(TASK_ID, "Write the failing acceptance scenario", false, NOW));

        mockMvc.perform(post(TASKS)
                        .with(jwt().authorities(authority(WRITE)))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"Write the failing acceptance scenario\"}"))
                .andExpect(status().isCreated())
                .andExpect(header().string("Location", TASKS + "/" + TASK_ID))
                .andExpect(jsonPath("$.id").value(TASK_ID))
                .andExpect(jsonPath("$.completed").value(false));
    }

    @Test
    @DisplayName("POST /api/tasks with a blank title returns 400 as a Problem")
    void rejectsBlankTitle() throws Exception {
        willThrow(new InvalidTaskException("Title must not be blank"))
                .given(taskService)
                .createTask(any());

        mockMvc.perform(post(TASKS)
                        .with(jwt().authorities(authority(WRITE)))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath(JSON_STATUS).value(HttpStatus.BAD_REQUEST.value()))
                .andExpect(jsonPath(JSON_TITLE).value("Invalid task"))
                // The exact text matters: it is the only thing that tells the
                // caller WHICH field was wrong and why.
                .andExpect(jsonPath(JSON_DETAIL).value("title size must be between 1 and 200"));
    }

    @Test
    @DisplayName("POST /api/tasks with an over-long title returns 400")
    void rejectsOverLongTitle() throws Exception {
        willThrow(new InvalidTaskException("Title must be at most 200 characters"))
                .given(taskService)
                .createTask(any());

        mockMvc.perform(post(TASKS)
                        .with(jwt().authorities(authority(WRITE)))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"" + "x".repeat(Task.MAX_TITLE_LENGTH + 1) + "\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath(JSON_STATUS).value(HttpStatus.BAD_REQUEST.value()));
    }

    @Test
    @DisplayName("a whitespace-only title is rejected by the domain, not bean validation")
    void rejectsWhitespaceOnlyTitle() throws Exception {
        // "   " is three characters, so @Size(min = 1) lets it through and the
        // domain rule is what rejects it. This is the only path that reaches
        // the InvalidTaskException handler.
        willThrow(new InvalidTaskException("Title must not be blank"))
                .given(taskService)
                .createTask(any());

        mockMvc.perform(post(TASKS)
                        .with(jwt().authorities(authority(WRITE)))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"   \"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath(JSON_STATUS).value(HttpStatus.BAD_REQUEST.value()))
                .andExpect(jsonPath(JSON_TITLE).value("Invalid task"))
                .andExpect(jsonPath(JSON_DETAIL).value("Title must not be blank"));
    }

    @Test
    @DisplayName("a malformed request body returns 400 as a Problem, not a stack trace")
    void rejectsUnreadableBody() throws Exception {
        mockMvc.perform(post(TASKS)
                        .with(jwt().authorities(authority(WRITE)))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{not json"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath(JSON_STATUS).value(HttpStatus.BAD_REQUEST.value()))
                .andExpect(jsonPath(JSON_TITLE).value("Invalid task"))
                .andExpect(jsonPath(JSON_DETAIL).value("The request body could not be read"));
    }

    @Test
    @DisplayName("GET /api/tasks/{id} returns 404 as a Problem when absent")
    void missingTaskIsProblem() throws Exception {
        given(taskService.getTask("missing")).willThrow(new TaskNotFoundException("missing"));

        mockMvc.perform(get(TASKS + "/missing").with(jwt().authorities(authority(READ))))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath(JSON_STATUS).value(HttpStatus.NOT_FOUND.value()))
                .andExpect(jsonPath(JSON_TITLE).value("Task not found"))
                .andExpect(jsonPath(JSON_DETAIL).value("No task exists with id missing"));
    }

    @Test
    @DisplayName("GET /api/tasks/{id} returns the task when present")
    void returnsTask() throws Exception {
        given(taskService.getTask(TASK_ID)).willReturn(new Task(TASK_ID, "a task", false, NOW));

        mockMvc.perform(get(TASKS + "/" + TASK_ID).with(jwt().authorities(authority(READ))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(TASK_ID))
                .andExpect(jsonPath(JSON_TITLE).value("a task"));
    }

    private static SimpleGrantedAuthority authority(String scope) {
        return new SimpleGrantedAuthority(scope);
    }
}

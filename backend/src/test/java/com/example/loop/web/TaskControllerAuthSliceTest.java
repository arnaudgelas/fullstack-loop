package com.example.loop.web;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.example.loop.domain.TaskService;
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
 * MIDDLE RING — web slice, authentication and authorization.
 *
 * <p>The contract promises a {@code Problem} body for 401 and 403, and Spring
 * Security's defaults give an empty one. These cases run in the fast ring, with
 * no container and no real token, so a regression in the entry point or the
 * access-denied handler is caught in seconds rather than only by the
 * Testcontainers suite.
 */
// See TaskControllerWebMvcTest: static imports are how a MockMvc test stays readable.
@SuppressWarnings("PMD.TooManyStaticImports")
@WebMvcTest(controllers = TaskController.class)
@Import({
    SecurityConfiguration.class,
    ProblemAuthenticationEntryPoint.class,
    ProblemAccessDeniedHandler.class,
    ProblemResponseWriter.class
})
class TaskControllerAuthSliceTest {

    private static final String TASKS = "/api/tasks";
    private static final String PROBLEM_JSON = "application/json;charset=UTF-8";

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private TaskService taskService;

    @MockitoBean
    private JwtDecoder jwtDecoder;

    @Test
    @DisplayName("an unauthenticated call is 401 with a Problem body")
    void unauthenticatedIsProblem() throws Exception {
        mockMvc.perform(get(TASKS))
                .andExpect(status().isUnauthorized())
                // Exact content type, charset included: the entry point writes
                // straight to the servlet response, so nothing else sets it.
                .andExpect(content().contentType(PROBLEM_JSON))
                .andExpect(header().string("WWW-Authenticate", "Bearer"))
                .andExpect(jsonPath("$.status").value(HttpStatus.UNAUTHORIZED.value()))
                .andExpect(jsonPath("$.title").value("Unauthorized"))
                .andExpect(jsonPath("$.detail").value("A valid bearer token is required to call this endpoint"));
    }

    @Test
    @DisplayName("a token without tasks:write is 403 with a Problem body")
    void missingScopeIsProblem() throws Exception {
        mockMvc.perform(post(TASKS)
                        .with(jwt().authorities(new SimpleGrantedAuthority("SCOPE_tasks:read")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"nope\"}"))
                .andExpect(status().isForbidden())
                .andExpect(content().contentType(PROBLEM_JSON))
                .andExpect(jsonPath("$.status").value(HttpStatus.FORBIDDEN.value()))
                .andExpect(jsonPath("$.title").value("Forbidden"))
                .andExpect(jsonPath("$.detail").value("The token does not carry the scope required for this endpoint"));
    }

    @Test
    @DisplayName("a token with tasks:read may list tasks")
    void readScopeMayList() throws Exception {
        mockMvc.perform(get(TASKS).with(jwt().authorities(new SimpleGrantedAuthority("SCOPE_tasks:read"))))
                .andExpect(status().isOk());
    }
}

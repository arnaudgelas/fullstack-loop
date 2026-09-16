package com.example.loop.acceptance;

import static org.assertj.core.api.Assertions.assertThat;

import io.cucumber.java.en.Then;
import io.cucumber.java.en.When;
import java.util.Map;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;

/** Steps about what an unauthenticated caller is told. */
public class AuthSteps {

    /** Sentinel meaning "the When step has not run yet". */
    private static final ResponseEntity<Map<String, Object>> NOT_CALLED =
            ResponseEntity.noContent().build();

    private final ApiClient api;
    private ResponseEntity<Map<String, Object>> response = NOT_CALLED;

    @Autowired
    AuthSteps(ApiClient api) {
        this.api = api;
    }

    @When("I call the API without a token")
    public void iCallTheApiWithoutAToken() {
        response = api.listTasksAnonymously();
    }

    @Then("the API refuses me with a {int} and a problem document")
    public void theApiRefusesMe(int expectedStatus) {
        assertThat(response)
                .as("the request step must run before the assertion step")
                .isNotSameAs(NOT_CALLED);
        assertThat(response.getStatusCode().value()).isEqualTo(expectedStatus);
        assertThat(response.getBody())
                .isNotNull()
                .containsEntry("status", expectedStatus)
                .containsKey("title");
    }
}

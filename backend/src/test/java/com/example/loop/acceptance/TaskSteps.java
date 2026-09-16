package com.example.loop.acceptance;

import static org.assertj.core.api.Assertions.assertThat;

import io.cucumber.java.en.And;
import io.cucumber.java.en.Given;
import io.cucumber.java.en.Then;
import io.cucumber.java.en.When;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

/** Steps about capturing and listing work. They talk HTTP only. */
public class TaskSteps {

    private final ApiClient api;
    /**
     * Carries the listing from the "Then" step to the "And" steps after it.
     * Initialized empty rather than left null, so a scenario whose steps are in
     * the wrong order fails on a readable assertion instead of an NPE.
     */
    private List<Map<String, Object>> listed = List.of();

    @Autowired
    TaskSteps(ApiClient api) {
        this.api = api;
    }

    @Given("the task list is empty")
    public void theTaskListIsEmpty() {
        api.wipeStore();
        assertThat(api.listTasks()).isEmpty();
    }

    @Given("a task {string} has already been captured")
    public void aTaskHasAlreadyBeenCaptured(String title) {
        assertThat(api.createTask(title).getStatusCode()).isEqualTo(HttpStatus.CREATED);
    }

    @When("I capture the task {string}")
    public void iCaptureTheTask(String title) {
        ResponseEntity<Map<String, Object>> response = api.createTask(title);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        assertThat(response.getHeaders().getLocation()).isNotNull();
    }

    @Then("the task list shows {int} tasks")
    public void theTaskListShowsTasks(int expected) {
        listed = api.listTasks();
        assertThat(listed).hasSize(expected);
    }

    @And("the first task is {string}")
    public void theFirstTaskIs(String title) {
        assertThat(listed.get(0)).containsEntry("title", title);
    }

    @And("that task is not completed")
    public void thatTaskIsNotCompleted() {
        assertThat(listed.get(0)).containsEntry("completed", false);
    }
}

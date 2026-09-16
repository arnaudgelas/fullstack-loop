Feature: Capture work as tasks
  As someone running the loop
  I want the work I capture to be listed with the newest first
  So that what I just thought of is the first thing I see

  Scenario: A newly captured task appears at the top of the list
    Given the task list is empty
    And a task "Write the failing acceptance scenario" has already been captured
    When I capture the task "Verify the provider against the consumer pact"
    Then the task list shows 2 tasks
    And the first task is "Verify the provider against the consumer pact"
    And that task is not completed

  Scenario: An unauthenticated caller is told so rather than shown an empty list
    When I call the API without a token
    Then the API refuses me with a 401 and a problem document

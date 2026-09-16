package com.example.loop.domain;

import static com.example.loop.domain.Task.MAX_TITLE_LENGTH;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Instant;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/** INNER RING — pure domain unit test. No Spring context, no Docker. */
class TaskTest {

    private static final Instant NOW = Instant.parse("2026-01-01T00:00:00Z");

    @Test
    @DisplayName("a new task starts pending and without an identifier")
    void newTaskIsPending() {
        Task task = Task.pending("Write the failing acceptance scenario", NOW);

        assertThat(task.id()).isNull();
        assertThat(task.title()).isEqualTo("Write the failing acceptance scenario");
        assertThat(task.completed()).isFalse();
        assertThat(task.createdAt()).isEqualTo(NOW);
    }

    @Test
    @DisplayName("surrounding whitespace is stripped from the title")
    void titleIsStripped() {
        assertThat(Task.pending("  tidy up  ", NOW).title()).isEqualTo("tidy up");
    }

    @Test
    @DisplayName("a null title is rejected")
    void nullTitleRejected() {
        assertThatThrownBy(() -> Task.pending(null, NOW))
                .isInstanceOf(InvalidTaskException.class)
                .hasMessageContaining("blank");
    }

    @Test
    @DisplayName("a blank title is rejected")
    void blankTitleRejected() {
        assertThatThrownBy(() -> Task.pending("   ", NOW))
                .isInstanceOf(InvalidTaskException.class)
                .hasMessageContaining("blank");
    }

    @Test
    @DisplayName("a title longer than 200 characters is rejected")
    void tooLongTitleRejected() {
        String tooLong = "x".repeat(MAX_TITLE_LENGTH + 1);

        assertThatThrownBy(() -> Task.pending(tooLong, NOW))
                .isInstanceOf(InvalidTaskException.class)
                .hasMessageContaining("200");
    }

    @Test
    @DisplayName("a title of exactly 200 characters is accepted")
    void boundaryTitleAccepted() {
        String exactly = "x".repeat(MAX_TITLE_LENGTH);

        assertThat(Task.pending(exactly, NOW).title()).hasSize(MAX_TITLE_LENGTH);
    }
}

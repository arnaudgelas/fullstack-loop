package com.example.loop.web;

import com.example.loop.api.model.Task;

/** Translates domain tasks into the generated wire model. */
final class TaskMapper {

    private TaskMapper() {}

    static Task toApi(com.example.loop.domain.Task task) {
        Task payload = new Task();
        payload.setId(task.id());
        payload.setTitle(task.title());
        payload.setCompleted(task.completed());
        return payload;
    }
}

package com.example.loop.web;

import com.example.loop.api.TasksApi;
import com.example.loop.api.model.NewTask;
import com.example.loop.api.model.Task;
import com.example.loop.domain.TaskService;
import java.net.URI;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RestController;

/**
 * Thin web adapter. It implements {@link TasksApi}, which is generated from
 * openapi/openapi.yaml at build time — the HTTP signatures are never written by
 * hand here. All this class does is translate between HTTP and the domain.
 */
@RestController
public class TaskController implements TasksApi {

    private final TaskService taskService;

    TaskController(TaskService taskService) {
        this.taskService = taskService;
    }

    @Override
    public ResponseEntity<List<Task>> listTasks() {
        List<Task> body =
                taskService.listTasks().stream().map(TaskMapper::toApi).toList();
        return ResponseEntity.ok(body);
    }

    @Override
    public ResponseEntity<Task> createTask(NewTask newTask) {
        // No null check on newTask: the generated interface declares the body
        // @Valid and required, so an absent body is rejected by the message
        // converter before this method is entered. A defensive branch here would
        // be unreachable code that no test could ever cover.
        com.example.loop.domain.Task created = taskService.createTask(newTask.getTitle());
        return ResponseEntity.created(URI.create("/api/tasks/" + created.id())).body(TaskMapper.toApi(created));
    }

    @Override
    public ResponseEntity<Task> getTask(String taskId) {
        return ResponseEntity.ok(TaskMapper.toApi(taskService.getTask(taskId)));
    }
}

package com.example.loop.domain;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicInteger;

/** Trivial test double so the inner ring never needs a database. */
public class InMemoryTaskRepository implements TaskRepository {

    private final List<Task> tasks = new ArrayList<>();
    private final AtomicInteger sequence = new AtomicInteger();

    @Override
    public List<Task> findAllNewestFirst() {
        return tasks.stream()
                .sorted(Comparator.comparing(Task::createdAt).reversed())
                .toList();
    }

    @Override
    public Task save(Task task) {
        Task stored = task.id() == null ? task.withId("id-" + sequence.incrementAndGet()) : task;
        // Every task in this list has been through save(), so it has an id;
        // compare the other way round so the non-null side is the receiver.
        tasks.removeIf(existing -> Objects.equals(existing.id(), stored.id()));
        tasks.add(stored);
        return stored;
    }

    @Override
    public Optional<Task> findById(String id) {
        return tasks.stream().filter(task -> id.equals(task.id())).findFirst();
    }
}

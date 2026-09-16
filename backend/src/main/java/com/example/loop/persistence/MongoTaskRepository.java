package com.example.loop.persistence;

import com.example.loop.domain.Task;
import com.example.loop.domain.TaskRepository;
import java.util.List;
import java.util.Optional;
import org.springframework.stereotype.Repository;

/** Adapter binding the domain's {@link TaskRepository} port to MongoDB. */
@Repository
public class MongoTaskRepository implements TaskRepository {

    private final SpringDataTaskRepository delegate;

    MongoTaskRepository(SpringDataTaskRepository delegate) {
        this.delegate = delegate;
    }

    @Override
    public List<Task> findAllNewestFirst() {
        return delegate.findAllByOrderByCreatedAtDescIdDesc().stream()
                .map(TaskDocument::toDomain)
                .toList();
    }

    @Override
    public Task save(Task task) {
        return delegate.save(TaskDocument.from(task)).toDomain();
    }

    @Override
    public Optional<Task> findById(String id) {
        return delegate.findById(id).map(TaskDocument::toDomain);
    }
}

package com.example.loop.persistence;

import java.util.List;
import java.util.Optional;
import org.springframework.data.mongodb.repository.MongoRepository;

/** Spring Data interface used by {@link MongoTaskRepository}. */
interface SpringDataTaskRepository extends MongoRepository<TaskDocument, String> {

    List<TaskDocument> findAllByOrderByCreatedAtDescIdDesc();

    @Override
    Optional<TaskDocument> findById(String id);
}

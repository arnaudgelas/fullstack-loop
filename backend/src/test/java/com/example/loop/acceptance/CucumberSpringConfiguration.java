package com.example.loop.acceptance;

import com.example.loop.FullstackLoopBackendApplication;
import com.example.loop.support.MongoTestcontainer;
import io.cucumber.spring.CucumberContextConfiguration;
import org.springframework.boot.test.context.SpringBootTest;

/** Boots the whole application on a random port against Testcontainers Mongo. */
@CucumberContextConfiguration
@SpringBootTest(
        classes = FullstackLoopBackendApplication.class,
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
public class CucumberSpringConfiguration extends MongoTestcontainer {}

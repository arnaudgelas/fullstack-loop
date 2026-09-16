package com.example.loop.acceptance;

import org.junit.platform.suite.api.ConfigurationParameter;
import org.junit.platform.suite.api.IncludeEngines;
import org.junit.platform.suite.api.SelectClasspathResource;
import org.junit.platform.suite.api.Suite;

/**
 * OUTER RING — the BDD acceptance loop. Runs the Gherkin scenarios against a
 * real HTTP server and a real MongoDB, but below the browser: the business
 * outcome is checked through the API, not through a rendered page.
 *
 * <p>Named *IT and tagged (via the glue's {@code requires-docker} tag on the
 * step definitions' Spring context) so it runs under failsafe, not surefire.
 */
@Suite
@IncludeEngines("cucumber")
@SelectClasspathResource("features")
@ConfigurationParameter(key = "cucumber.glue", value = "com.example.loop.acceptance")
@ConfigurationParameter(key = "cucumber.plugin", value = "pretty, summary")
@org.junit.jupiter.api.Tag("requires-docker")
class CucumberAcceptanceIT {}

package com.example.loop.architecture;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;

import com.example.loop.FullstackLoopBackendApplication;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.library.Architectures;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * Makes the architecture executable instead of aspirational.
 *
 * <p>The design is a ports-and-adapters onion: a pure-Java domain in the middle,
 * with the HTTP adapter and the MongoDB adapter around it, and every dependency
 * pointing inwards. That is what lets the domain be unit-tested without a Spring
 * context or a database, and what lets either adapter be replaced without
 * touching a business rule.
 *
 * <p>Such a rule survives exactly as long as something enforces it. Comments and
 * code review do not; these tests do. They run in the inner ring — no Spring
 * context, no Docker — so a misplaced import fails in seconds rather than
 * decaying quietly over months.
 *
 * <p>The generated {@code com.example.loop.api} package is imported too: the web
 * adapter is allowed to depend on it, and the domain is not.
 */
class LayeringArchitectureTest {

    private static final String DOMAIN = "com.example.loop.domain..";
    private static final String PERSISTENCE = "com.example.loop.persistence..";
    private static final String WEB = "com.example.loop.web..";
    private static final String GENERATED_API = "com.example.loop.api..";
    private static final String CONFIG = "com.example.loop.config..";

    // PMD's LooseCoupling wants an interface here; JavaClasses IS ArchUnit's
    // public type for an imported class graph and has no interface to use.
    @SuppressWarnings("PMD.LooseCoupling")
    private final JavaClasses classes = new ClassFileImporter()
            .withImportOption(ImportOption.Predefined.DO_NOT_INCLUDE_TESTS)
            .importPackagesOf(FullstackLoopBackendApplication.class);

    @Test
    @DisplayName("the domain depends on no framework at all")
    void domainIsFrameworkFree() {
        noClasses()
                .that()
                .resideInAPackage(DOMAIN)
                .should()
                .dependOnClassesThat()
                .resideInAnyPackage(
                        "org.springframework..",
                        "jakarta.servlet..",
                        "jakarta.validation..",
                        "com.fasterxml.jackson..",
                        "com.mongodb..",
                        "org.bson..")
                .because("the domain is plain Java; frameworks live in the adapters")
                .check(classes);
    }

    @Test
    @DisplayName("the domain knows nothing about Spring Security — auth is a web concern")
    void domainIsFreeOfSpringSecurity() {
        noClasses()
                .that()
                .resideInAPackage(DOMAIN)
                .should()
                .dependOnClassesThat()
                .resideInAnyPackage("org.springframework.security..", "com.nimbusds..")
                .because("authentication is an HTTP adapter concern, not a business rule")
                .check(classes);
    }

    @Test
    @DisplayName("the domain does not depend on the web or persistence adapters")
    void domainDoesNotDependOnAdapters() {
        noClasses()
                .that()
                .resideInAPackage(DOMAIN)
                .should()
                .dependOnClassesThat()
                .resideInAnyPackage(WEB, PERSISTENCE, GENERATED_API, CONFIG)
                .because("dependencies point inwards, towards the domain")
                .check(classes);
    }

    @Test
    @DisplayName("the web adapter never reaches into persistence directly")
    void webDoesNotReachPersistence() {
        noClasses()
                .that()
                .resideInAPackage(WEB)
                .should()
                .dependOnClassesThat()
                .resideInAPackage(PERSISTENCE)
                .because("the web adapter talks to the domain service, not to storage")
                .check(classes);
    }

    @Test
    @DisplayName("persistence does not depend on the web adapter or the generated API")
    void persistenceDoesNotDependOnWeb() {
        noClasses()
                .that()
                .resideInAPackage(PERSISTENCE)
                .should()
                .dependOnClassesThat()
                .resideInAnyPackage(WEB, GENERATED_API)
                .because("storage knows nothing about HTTP")
                .check(classes);
    }

    @Test
    @DisplayName("the generated API model stays inside the web adapter")
    void generatedModelDoesNotLeak() {
        noClasses()
                .that()
                .resideInAnyPackage(DOMAIN, PERSISTENCE)
                .should()
                .dependOnClassesThat()
                .resideInAPackage(GENERATED_API)
                .because("the wire model is a detail of the HTTP adapter")
                .check(classes);
    }

    @Test
    @DisplayName("dependencies point inwards: no layer is reached from outside itself")
    void layersAreRespected() {
        Architectures.layeredArchitecture()
                .consideringOnlyDependenciesInLayers()
                .layer("Domain")
                .definedBy(DOMAIN)
                .layer("Persistence")
                .definedBy(PERSISTENCE)
                .layer("Web")
                .definedBy(WEB)
                .layer("GeneratedApi")
                .definedBy(GENERATED_API)
                .layer("Config")
                .definedBy(CONFIG)
                .whereLayer("Web")
                .mayNotBeAccessedByAnyLayer()
                .whereLayer("Persistence")
                .mayOnlyBeAccessedByLayers("Config")
                .whereLayer("GeneratedApi")
                .mayOnlyBeAccessedByLayers("Web")
                .check(classes);
    }
}

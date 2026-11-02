plugins {
    java
    id("org.springframework.boot") version "4.1.1"
    id("io.spring.dependency-management") version "1.1.7"
}

group = "com.expresso"
version = "0.0.1-SNAPSHOT"

java {
    toolchain { languageVersion = JavaLanguageVersion.of(21) }
}

repositories { mavenCentral() }

// 계약의 단일 timezone 목록을 순수 Java 상수로 생성합니다.
val timezonePolicy = rootProject.file("../../packages/contracts/src/career-business-timezones.json")
val generatedTimezoneSources = layout.buildDirectory.dir("generated/sources/careerBusinessTimezones/java")
val generateCareerBusinessTimezones = tasks.register("generateCareerBusinessTimezones") {
    inputs.file(timezonePolicy)
    outputs.dir(generatedTimezoneSources)
    doLast {
        val policy = groovy.json.JsonSlurper().parse(timezonePolicy) as Map<*, *>
        val identifiers = policy["identifiers"] as List<*>
        val literals = identifiers.joinToString(",\n") { "            \"$it\"" }
        val output = generatedTimezoneSources.get().file("com/expresso/backend/career/domain/CanonicalBusinessTimezones.java").asFile
        output.parentFile.mkdirs()
        output.writeText(buildString {
            appendLine("package com.expresso.backend.career.domain;")
            appendLine()
            appendLine("// 계약 JSON에서 생성됩니다. 이 파일을 직접 수정하지 않습니다.")
            appendLine("final class CanonicalBusinessTimezones {")
            appendLine("    static final java.util.Set<String> IDENTIFIERS = java.util.Set.of(")
            appendLine(literals)
            appendLine("    );")
            appendLine("    private CanonicalBusinessTimezones() {}")
            appendLine("}")
        })
    }
}
sourceSets.main { java.srcDir(generatedTimezoneSources) }
tasks.compileJava { dependsOn(generateCareerBusinessTimezones) }

dependencies {
    implementation("org.springframework.boot:spring-boot-starter")
    implementation("org.springframework.boot:spring-boot-starter-jackson")
    implementation("org.mongodb:bson")
    implementation("org.mongodb:mongodb-driver-sync")
    implementation("org.springframework.boot:spring-boot-starter-webmvc")
    implementation("org.springframework.boot:spring-boot-starter-security")
    testImplementation("org.springframework.boot:spring-boot-starter-test")
    testImplementation("org.springframework.boot:spring-boot-starter-webmvc-test")
    testImplementation("org.springframework.boot:spring-boot-starter-security-test")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")
}

tasks.withType<Test> {
    useJUnitPlatform()
    systemProperty("careerBusinessFixture", rootProject.file("../../packages/contracts/openapi/fixtures/career-business-v1.json").absolutePath)
    systemProperty("careerBusinessBoundaryFixture", rootProject.file("../../packages/contracts/openapi/fixtures/career-business-boundaries-v1.json").absolutePath)
    systemProperty("careerBusinessTimezonePolicy", timezonePolicy.absolutePath)
    systemProperty("b1RepositoryRoot", rootProject.file("../..").absolutePath)
}

package com.expresso.backend.operations;

import org.springframework.context.annotation.Profile;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@Profile("operations")
class OperationsHealthController {
    private final OperationsMongoReadiness mongo;
    OperationsHealthController(OperationsMongoReadiness mongo) { this.mongo = mongo; }
    record Liveness(String status) {}
    record Checks(String mongodb) {}
    record Readiness(String status, Checks checks) {}
    @GetMapping("/health/live") Liveness live() { return new Liveness("ok"); }
    @GetMapping("/health/ready") ResponseEntity<Readiness> ready() {
        boolean ready = mongo.ready();
        return ResponseEntity.status(ready ? 200 : 503).body(new Readiness(ready ? "ready" : "not_ready", new Checks(ready ? "up" : "down")));
    }
}

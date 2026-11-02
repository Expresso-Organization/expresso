package com.expresso.backend.career.integration;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import tools.jackson.databind.JsonNode;

@RestController
@RequestMapping("/internal/career/integration/business")
@ConditionalOnProperty(name={"career.writer.enabled","career.integration.enabled"},havingValue="true")
public final class CareerProducerBusinessController {
    private final CareerProducerBusinessService service;
    public CareerProducerBusinessController(CareerProducerBusinessService service) {this.service=service;}
    @PostMapping public ResponseEntity<CareerProducerBusinessService.Result> commit(Authentication auth,@RequestHeader(value="If-Match",required=false) String match,@RequestBody JsonNode request) {
        var result=service.commit((ServiceActor)auth.getPrincipal(),request,match);
        return ResponseEntity.ok().eTag("\"v"+result.data().version()+"\"").body(result);
    }
}

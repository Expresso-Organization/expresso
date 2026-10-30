package com.expresso.backend.career.mutation;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.*;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import tools.jackson.databind.JsonNode;

@RestController
@RequestMapping("/internal/career/property-mutations")
@ConditionalOnProperty(name={"career.writer.enabled","career.property-mutation.enabled"},havingValue="true")
public final class CareerPropertyMutationController {
    private final CareerPropertyMutationHttpService service;
    public CareerPropertyMutationController(CareerPropertyMutationHttpService service) {this.service=service;}
    private static MutationServiceActor actor(Authentication auth) {return (MutationServiceActor)auth.getPrincipal();}
    @PostMapping("/receipt") public ResponseEntity<?> receipt(Authentication auth,@RequestBody JsonNode request) {
        var result=service.receipt(actor(auth),request);
        if(result==null)return ResponseEntity.ok().contentType(MediaType.APPLICATION_JSON).body("null");
        return ResponseEntity.ok().eTag("\"v"+result.data().version()+"\"").body(result);
    }
    @PostMapping("/read") public ResponseEntity<?> read(Authentication auth,@RequestBody JsonNode request) {
        var result=service.read(actor(auth),request);return ResponseEntity.ok().eTag("\"v"+result.data().version()+"\"").body(result);
    }
    @PostMapping("/commit") public ResponseEntity<?> commit(Authentication auth,@RequestHeader(value="If-Match",required=false) String match,@RequestBody JsonNode request) {
        var result=service.commit(actor(auth),request,match);return ResponseEntity.ok().eTag("\"v"+result.data().version()+"\"").body(result);
    }
}

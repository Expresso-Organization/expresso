package com.expresso.backend.career.http;

import java.util.*;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import tools.jackson.databind.JsonNode;
import com.expresso.backend.career.application.*;
import com.expresso.backend.career.application.CareerCommandRepository.Actor;
import com.expresso.backend.career.dto.CareerRecordLinkData;

@RestController
@RequestMapping("/v1/career/records/{id}/links")
@ConditionalOnProperty(name="career.writer.enabled",havingValue="true")
public final class CareerRecordLinkController {
    private final CareerCommandService service;
    public CareerRecordLinkController(CareerCommandService service) {this.service=service;}
    @PostMapping public ResponseEntity<?> create(Authentication auth,@PathVariable String id,@RequestHeader(value="If-Match",required=false)String match,@RequestBody JsonNode input) {
        CareerBusinessInput.fields(input,Set.of("toRecordId","relation"),Set.of("toRecordId","relation"));
        var record=CareerBusinessInput.uuid(id);var result=service.createLink((Actor)auth.getPrincipal(),record,CareerBusinessInput.version(match),CareerBusinessInput.uuid(input.get("toRecordId")),CareerBusinessInput.text(input.get("relation")));
        return ResponseEntity.status(201).eTag("\"v"+result.version()+"\"").body(Map.of("data",CareerRecordLinkData.from(result.link(),record)));
    }
    @GetMapping public Map<String,Object> list(Authentication auth,@PathVariable String id) {
        var record=CareerBusinessInput.uuid(id);return Map.of("data",service.listLinks((Actor)auth.getPrincipal(),record).stream().map(link->CareerRecordLinkData.from(link,record)).toList());
    }
}

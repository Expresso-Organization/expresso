package com.expresso.backend.career.http;

import java.util.*;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import tools.jackson.databind.JsonNode;
import com.expresso.backend.career.application.*;
import com.expresso.backend.career.application.CareerCommandRepository.Actor;
import com.expresso.backend.career.domain.CareerRecord;
import com.expresso.backend.career.dto.CareerBusinessRecordData;

@RestController
@RequestMapping("/v1/career/records")
@ConditionalOnProperty(name="career.writer.enabled",havingValue="true")
public final class CareerCommandController {
    private final CareerCommandService service;
    public CareerCommandController(CareerCommandService service) {this.service=service;}
    private static Actor actor(Authentication authentication) {return (Actor)authentication.getPrincipal();}
    private static ResponseEntity<CareerBusinessRecordData.Response> response(CareerRecord record,int status) {
        return ResponseEntity.status(status).eTag("\"v"+record.version()+"\"").body(new CareerBusinessRecordData.Response(CareerBusinessRecordData.from(record)));
    }
    @PostMapping public ResponseEntity<?> create(Authentication auth,@RequestHeader(value="Idempotency-Key",required=false) String key,@RequestBody JsonNode input) {
        return response(service.create(actor(auth),CareerBusinessInput.create(input),key),201);
    }
    @PatchMapping("/{id}") public ResponseEntity<?> patch(Authentication auth,@PathVariable String id,@RequestHeader(value="If-Match",required=false) String match,@RequestBody JsonNode input) {
        return response(service.patch(actor(auth),CareerBusinessInput.uuid(id),CareerBusinessInput.version(match),CareerBusinessInput.patch(input)),200);
    }
    @DeleteMapping("/{id}") public ResponseEntity<?> trash(Authentication auth,@PathVariable String id,@RequestHeader(value="If-Match",required=false) String match) {
        return response(service.trash(actor(auth),CareerBusinessInput.uuid(id),CareerBusinessInput.version(match)),200);
    }
    @PostMapping("/{id}/restore") public ResponseEntity<?> restore(Authentication auth,@PathVariable String id,@RequestHeader(value="If-Match",required=false) String match,@RequestBody(required=false) JsonNode input) {
        if(input!=null) CareerBusinessInput.fields(input,Set.of(),Set.of());
        return response(service.restore(actor(auth),CareerBusinessInput.uuid(id),CareerBusinessInput.version(match)),200);
    }
    @PostMapping("/{id}/move/preview") public Map<String,Object> preview(Authentication auth,@PathVariable String id,@RequestHeader(value="If-Match",required=false) String match,@RequestBody JsonNode input) {
        CareerBusinessInput.fields(input,Set.of("targetCategoryId"),Set.of("targetCategoryId"));
        var preview=service.previewMove(actor(auth),CareerBusinessInput.uuid(id),CareerBusinessInput.version(match),CareerBusinessInput.uuid(input.get("targetCategoryId")));
        var conversions=preview.conversions().stream().map(c -> {
            var fields=new LinkedHashMap<String,Object>(); fields.put("sourcePropertyId",c.sourcePropertyId()); fields.put("targetPropertyId",c.targetPropertyId()); fields.put("kind",c.kind().name().toLowerCase(Locale.ROOT));
            fields.put("sampleBefore",CareerBusinessRecordData.PropertyValueData.from(c.sampleBefore())); fields.put("sampleAfter",c.sampleAfter()==null?null:CareerBusinessRecordData.PropertyValueData.from(c.sampleAfter())); return fields;
        }).toList();
        return Map.of("data",Map.of("previewToken",preview.previewToken(),"targetCategoryId",preview.targetCategoryId(),"version",preview.version(),"expiresAt",preview.expiresAt().toString(),"conversions",conversions,"unmappedPropertyIds",preview.unmappedPropertyIds()));
    }
    @PostMapping("/{id}/move") public ResponseEntity<?> move(Authentication auth,@PathVariable String id,@RequestHeader(value="If-Match",required=false) String match,@RequestBody JsonNode input) {
        CareerBusinessInput.fields(input,Set.of("targetCategoryId","previewToken","discardUnmappedPropertyIds"),Set.of("targetCategoryId","previewToken"));
        var token=CareerBusinessInput.text(input.get("previewToken")); if(token.length()<32 || token.length()>4096) throw new IllegalArgumentException("preview token 범위 오류입니다");
        return response(service.move(actor(auth),CareerBusinessInput.uuid(id),CareerBusinessInput.version(match),CareerBusinessInput.uuid(input.get("targetCategoryId")),token,input.has("discardUnmappedPropertyIds")?CareerBusinessInput.ids(input.get("discardUnmappedPropertyIds"),200):List.of()),200);
    }
    @PutMapping("/{id}/relations") public ResponseEntity<?> relation(Authentication auth,@PathVariable String id,@RequestHeader(value="If-Match",required=false) String match,@RequestBody JsonNode input) {
        CareerBusinessInput.fields(input,Set.of("propertyId","targetIds"),Set.of("propertyId","targetIds"));
        return response(service.relation(actor(auth),CareerBusinessInput.uuid(id),CareerBusinessInput.version(match),CareerBusinessInput.uuid(input.get("propertyId")),CareerBusinessInput.ids(input.get("targetIds"),1000)),200);
    }
}

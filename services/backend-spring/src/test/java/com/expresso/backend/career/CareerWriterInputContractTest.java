package com.expresso.backend.career;

import static org.junit.jupiter.api.Assertions.*;
import java.nio.file.*;
import java.util.Set;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import com.expresso.backend.career.http.CareerBusinessInput;

class CareerWriterInputContractTest {
    @Test void sharedCommandFixtureHasTheSameJavaInputVerdict() throws Exception {
        var path=Path.of(System.getProperty("b1RepositoryRoot"),"packages/contracts/openapi/fixtures/career-writer-v1.json");
        var fixture=JsonMapper.builder().build().readTree(Files.readString(path));
        for(var item:fixture.get("cases")) {
            var input=item.get("input");
            var valid=true;
            try { parse(item.get("kind").asText(),input); } catch(IllegalArgumentException exception) {valid=false;}
            assertEquals(item.get("valid").asBoolean(),valid,item.get("name").asText());
        }
    }
    private static void parse(String kind,JsonNode input) {
        switch(kind) {
            case "create" -> CareerBusinessInput.create(input);
            case "patch" -> CareerBusinessInput.patch(input);
            case "ifMatch" -> CareerBusinessInput.version(CareerBusinessInput.text(input));
            case "move" -> {
                CareerBusinessInput.fields(input,Set.of("targetCategoryId","previewToken"),Set.of("targetCategoryId","previewToken"));
                CareerBusinessInput.uuid(input.get("targetCategoryId"));
                var token=CareerBusinessInput.text(input.get("previewToken")); if(token.length()<32 || token.length()>4096) throw new IllegalArgumentException();
            }
            case "relation" -> {
                CareerBusinessInput.fields(input,Set.of("propertyId","targetIds"),Set.of("propertyId","targetIds"));
                CareerBusinessInput.uuid(input.get("propertyId"));CareerBusinessInput.ids(input.get("targetIds"),1000);
            }
            default -> throw new IllegalArgumentException();
        }
    }
}

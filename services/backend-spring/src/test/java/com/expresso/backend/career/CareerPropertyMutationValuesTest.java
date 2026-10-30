package com.expresso.backend.career;

import static org.junit.jupiter.api.Assertions.*;
import java.nio.file.*;
import java.time.Instant;
import java.util.*;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.JsonNode;
import com.expresso.backend.career.domain.*;
import com.expresso.backend.career.http.CareerBusinessInput;
import com.expresso.backend.career.dto.CareerBusinessRecordData.PropertyValueData;
import com.expresso.backend.career.application.CareerCommandException;
import com.expresso.backend.career.application.CareerPropertyMutationValues;
import com.expresso.backend.career.application.PatchCareerBusinessCommand.PropertyDelta;

class CareerPropertyMutationValuesTest {
    @Test void datetimeTimezoneLossRequiresConfirmationWhilePreservingStartString() {
        var id="00000000-0000-4000-8000-000000000011";
        var start="2026-09-01T03:02:01.123456789+09:00";
        var source=new PropertyDefinition(id,"p","p",PropertyDefinitionType.DATE,false,false,Map.of(),0,1,null);
        var before=new DatePropertyValue(id,DatePropertyValue.Precision.DATETIME,start,null,"Asia/Seoul");
        for(var type:List.of(PropertyDefinitionType.TEXT,PropertyDefinitionType.URL,PropertyDefinitionType.EMAIL,PropertyDefinitionType.PHONE)) {
            var target=new PropertyDefinition(id,"p","p",type,false,false,Map.of(),0,2,null);
            var after=new TextualPropertyValue(id,PropertyValueType.valueOf(type.name()),start);
            assertEquals(new CareerPropertyMutationValues.Conversion("lossy",after),CareerPropertyMutationValues.convert(before,target),type.wireName());
            var rejected=assertThrows(CareerCommandException.class,() -> CareerPropertyMutationValues.delta("conversion",source,target,null,false,List.of(before),null));
            assertEquals("LOSSY_CONFIRMATION_REQUIRED",rejected.code());
            assertEquals(new PropertyDelta(List.of(after),List.of()),CareerPropertyMutationValues.delta("conversion",source,target,null,true,List.of(before),null));
            var withoutTimezone=new DatePropertyValue(id,DatePropertyValue.Precision.DATETIME,start,null,null);
            assertEquals(new CareerPropertyMutationValues.Conversion("safe",after),CareerPropertyMutationValues.convert(withoutTimezone,target));
            assertEquals(new PropertyDelta(List.of(after),List.of()),CareerPropertyMutationValues.delta("conversion",source,target,null,false,List.of(withoutTimezone),null));
        }
    }
    @Test void unsupportedDatetimeConversionsCannotBypassRejectionWithLossConfirmation() {
        var id="00000000-0000-4000-8000-000000000011";
        var source=new PropertyDefinition(id,"p","p",PropertyDefinitionType.DATE,false,false,Map.of(),0,1,null);
        var target=new PropertyDefinition(id,"p","p",PropertyDefinitionType.NUMBER,false,false,Map.of(),0,2,null);
        var before=new DatePropertyValue(id,DatePropertyValue.Precision.DATETIME,"2026-09-01T03:02:01.123456789+09:00",null,"Asia/Seoul");
        assertEquals(new CareerPropertyMutationValues.Conversion("unmapped",null),CareerPropertyMutationValues.convert(before,target));
        for(var confirmLossy:List.of(false,true)) {
            var rejected=assertThrows(CareerCommandException.class,() -> CareerPropertyMutationValues.delta("conversion",source,target,null,confirmLossy,List.of(before),null));
            assertEquals("UNSUPPORTED_PROPERTY_CONVERSION",rejected.code());
        }
    }
    @Test void sharedCanonicalConversionsPreserveExactDecimalsOptionsAssetsAndDate() throws Exception {
        var implementation=assertDoesNotThrow(() -> Class.forName("com.expresso.backend.career.application.CareerPropertyMutationValues"));
        var convert=implementation.getMethod("convert",PropertyValue.class,PropertyDefinition.class);
        var json=JsonMapper.builder().build();
        var rows=json.readTree(Files.readString(Path.of(System.getProperty("b1RepositoryRoot"),"packages/contracts/openapi/fixtures/career-property-mutation-v1.json")));
        for(var row:rows) {
            var before=CareerBusinessInput.values(json.createArrayNode().add(row.get("before"))).getFirst();
            var d=row.get("target");
            var target=new PropertyDefinition(d.get("id").asText(),d.get("key").asText(),d.get("name").asText(),PropertyDefinitionType.fromStoredName(d.get("type").asText()),false,false,
                    json.convertValue(d.get("config"),Map.class),0,1,null);
            var result=convert.invoke(null,before,target); var kind=(String)result.getClass().getMethod("kind").invoke(result);
            var actual=json.createObjectNode().put("kind",kind);
            var value=(PropertyValue)result.getClass().getMethod("value").invoke(result);
            if(value!=null) actual.set("value",json.valueToTree(PropertyValueData.from(value)));
            assertEquals(row.get("result"),actual,row.get("name").asText());
        }
    }
    @Test void customTimestampMutationPreservesCanonicalDatetimeAndRejectsDayRangeOrSystemAlias() {
        var id="00000000-0000-4000-8000-000000000011";var date=new DatePropertyValue(id,DatePropertyValue.Precision.DATETIME,"2026-10-09T01:02:03.123456789+09:00",null,"Asia/Seoul");
        for(var type:List.of(PropertyDefinitionType.CREATED_TIME,PropertyDefinitionType.UPDATED_TIME)) {
            var target=new PropertyDefinition(id,"timestamp","timestamp",type,false,false,Map.of(),0,3,null);var source=new PropertyDefinition(id,"timestamp","timestamp",type,false,false,Map.of(),0,2,Instant.parse("2026-10-09T00:00:00Z"));
            assertEquals(new CareerPropertyMutationValues.Conversion("exact",date),CareerPropertyMutationValues.convert(date,target));
            assertEquals(new PropertyDelta(List.of(date),List.of()),CareerPropertyMutationValues.delta("restoration",source,target,null,false,List.of(),date));
            assertEquals(new PropertyDelta(List.of(date),List.of()),CareerPropertyMutationValues.delta("conversion",source,target,null,false,List.of(date),null));
            for(var invalid:List.of(new DatePropertyValue(id,DatePropertyValue.Precision.DAY,"2026-10-09",null,null),new DatePropertyValue(id,DatePropertyValue.Precision.DATETIME,date.start(),"2026-10-10T00:00:00Z",date.timezone())))assertEquals("unmapped",CareerPropertyMutationValues.convert(invalid,target).kind());
            var system=new PropertyDefinition(id,"timestamp","timestamp",type,false,true,Map.of(),0,3,null);assertEquals("unmapped",CareerPropertyMutationValues.convert(date,system).kind());
        }
    }
}

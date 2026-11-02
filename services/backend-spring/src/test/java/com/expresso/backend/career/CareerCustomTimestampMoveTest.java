package com.expresso.backend.career;

import static org.junit.jupiter.api.Assertions.*;
import java.time.Instant;
import java.util.*;
import org.junit.jupiter.api.Test;
import com.expresso.backend.career.application.*;
import com.expresso.backend.career.domain.*;

class CareerCustomTimestampMoveTest {
    static String id(int n) {return String.format("00000000-0000-4000-8000-%012d",n);}
    static PropertyDefinition definition(int n,PropertyDefinitionType type,boolean system) {return new PropertyDefinition(id(n),"event","Event",type,false,system,Map.of(),0,1,null);}
    static DatePropertyValue timestamp() {return new DatePropertyValue(id(11),DatePropertyValue.Precision.DATETIME,"2026-10-01T03:02:01.123456789+09:00",null,"Asia/Seoul");}
    CareerCategoryMovePlan plan(PropertyDefinition source,PropertyDefinition target,DatePropertyValue value) {
        return new CareerCategoryMovePlanner().plan(new CareerRecord(id(4),id(2),id(3),"",List.of(value),CareerRecordStatus.DRAFT,1,Instant.EPOCH),new CareerCategory(id(3),"source","Source",List.of(source)),new CareerCategory(id(5),"target","Target",List.of(target)),Map.of(),Instant.parse("2026-10-09T00:00:00Z"));
    }
    @Test void customCreatedAndUpdatedTimestampMovesPreserveOffsetNanosAndTimezone() {
        for(var type:List.of(PropertyDefinitionType.CREATED_TIME,PropertyDefinitionType.UPDATED_TIME)) {
            var result=plan(definition(11,type,false),definition(12,type,false),timestamp());
            assertEquals(List.of(new DatePropertyValue(id(12),DatePropertyValue.Precision.DATETIME,"2026-10-01T03:02:01.123456789+09:00",null,"Asia/Seoul")),result.propertyValues());assertTrue(result.unmappedProperties().isEmpty());assertEquals(CareerPropertyConversion.Kind.EXACT,result.conversions().getFirst().kind());
        }
    }
    @Test void canonicalDateAndCustomTimestampConvertOnlyAnExistingSingleDatetime() {
        var value=timestamp();
        for(var type:List.of(PropertyDefinitionType.CREATED_TIME,PropertyDefinitionType.UPDATED_TIME)) {
            assertEquals(value.start(),((DatePropertyValue)plan(definition(11,PropertyDefinitionType.DATE,false),definition(12,type,false),value).propertyValues().getFirst()).start());
            assertEquals(value.start(),((DatePropertyValue)plan(definition(11,type,false),definition(12,PropertyDefinitionType.DATE,false),value).propertyValues().getFirst()).start());
            for(var invalid:List.of(new DatePropertyValue(id(11),DatePropertyValue.Precision.DAY,"2026-10-01",null,null),new DatePropertyValue(id(11),DatePropertyValue.Precision.DATETIME,value.start(),"2026-10-02T03:02:01.123456789+09:00","Asia/Seoul"))) {
                var result=plan(definition(11,PropertyDefinitionType.DATE,false),definition(12,type,false),invalid);assertTrue(result.propertyValues().isEmpty());assertEquals(invalid,result.unmappedProperties().get(id(11)).propertyValue());assertTrue(plan(definition(11,type,false),definition(12,PropertyDefinitionType.DATE,false),invalid).propertyValues().isEmpty());
            }
        }
    }
    @Test void systemTimestampDefinitionsRemainUnmapped() {
        var value=timestamp();
        for(var type:List.of(PropertyDefinitionType.CREATED_TIME,PropertyDefinitionType.UPDATED_TIME)) {
            assertTrue(plan(definition(11,PropertyDefinitionType.DATE,false),definition(12,type,true),value).propertyValues().isEmpty());
            assertTrue(plan(definition(11,type,true),definition(12,PropertyDefinitionType.DATE,false),value).propertyValues().isEmpty());
        }
    }
}
package com.expresso.backend.career.infrastructure.mongo;

import static org.junit.jupiter.api.Assertions.*;
import java.util.*;
import org.bson.Document;
import org.junit.jupiter.api.Test;
import com.expresso.backend.career.application.CareerCommandException;
import com.expresso.backend.career.domain.*;

class MongoCareerPrivatePropertyOptionsTest {
    static String id(int value){return String.format("00000000-0000-4000-8000-%012d",value);}
    PropertyDefinition definition(PropertyDefinitionType type,Map<String,Object> config){return new PropertyDefinition(id(3),"choice","선택",type,false,false,config,0,1,null);}
    MongoCareerPrivatePropertyOptions options(){return new MongoCareerPrivatePropertyOptions(null,null,id(1));}
    @Test void noApplicablePrivateRowsPreserveOrdinarySelectDefinitionsExactly() {
        var configurations=List.<Map<String,Object>>of(
                Map.of(),
                Map.of("options",List.of(Map.of("id",id(4),"color","blue"))),
                Map.of("options",List.of(Map.of("id",id(4),"name","same"),Map.of("id",id(5),"name","same"))),
                Map.of("options",List.of(Map.of("id",id(4),"name","가".repeat(201)))),
                Map.of("options",List.of(Map.of("id",id(4),"label","wire","name","display"))));
        var unrelated=new Document("propertyId",id(9)).append("optionId",id(10)).append("rawLabel","private").append("version",1L);
        for(var type:List.of(PropertyDefinitionType.SELECT,PropertyDefinitionType.MULTI_SELECT))for(var config:configurations)for(var ledger:List.of(List.<Document>of(),List.of(unrelated))) {
            var original=definition(type,config);
            var actual=options().overlaySnapshot(List.of(original),ledger).getFirst();
            assertSame(original,actual,"a property without applicable private options must retain its original definition");
            assertEquals(config,actual.config());
        }
    }
    @Test void applicablePrivateRowsStillRejectMappingsThatAreAmbiguous() {
        var original=definition(PropertyDefinitionType.SELECT,Map.of("options",List.of(Map.of("id",id(4),"label","common"))));
        for(var row:List.of(
                new Document("propertyId",id(3)).append("optionId",id(4)).append("rawLabel","different").append("version",1L),
                new Document("propertyId",id(3)).append("optionId",id(5)).append("rawLabel","common").append("version",1L),
                new Document("propertyId",id(3)).append("optionId",id(5)).append("rawLabel","private").append("version",2L))) {
            var error=assertThrows(CareerCommandException.class,()->options().overlaySnapshot(List.of(original),List.of(row)));
            assertEquals("PRIVATE_OPTION_MAPPING_CONFLICT",error.getMessage());
        }
    }
    @Test void applicablePrivateRowsPreserveExactLabelsAndCommonMetadata() {
        var original=definition(PropertyDefinitionType.SELECT,Map.of("options",List.of(Map.of("id",id(4),"label","common","color","blue"))));
        var row=new Document("propertyId",id(3)).append("optionId",id(5)).append("rawLabel"," Private ").append("version",1L);
        var actual=options().overlaySnapshot(List.of(original),List.of(row)).getFirst();
        assertEquals(List.of(Map.of("id",id(4),"label","common","name","common","color","blue"),Map.of("id",id(5),"label"," Private ","name"," Private ")),actual.config().get("options"));
        assertEquals(true,actual.config().get("legacyFreeformTags"));
        assertEquals(Map.of("options",List.of(Map.of("id",id(4),"label","common","color","blue"))),original.config());
    }
}
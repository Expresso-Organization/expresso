package com.expresso.backend.career;
import static org.junit.jupiter.api.Assertions.*;
import java.time.Instant;
import java.util.*;
import org.junit.jupiter.api.Test;
import com.expresso.backend.career.domain.*;
class CareerCategoryPropertyKeysTest {
    private PropertyDefinition def(String id,String key,Instant deleted) {
        return new PropertyDefinition(id,key,"같은 표시 이름",PropertyDefinitionType.TEXT,false,false,Map.of(),0,1,deleted);
    }
    @Test void tombstoneKeyRemainsReserved() {
        var error=assertThrows(IllegalArgumentException.class,()->new CareerCategory("c","category","Category",List.of(def("a","note",Instant.EPOCH),def("b","note",null))));
        assertEquals("DUPLICATE_CANONICAL_DEFINITION",error.getMessage());
    }
    @Test void definitionIdentityRemainsUniqueEvenWithDifferentKeys() {
        assertThrows(IllegalArgumentException.class,()->new CareerCategory("c","category","Category",List.of(def("a","note",Instant.EPOCH),def("a","other",null))));
    }
    @Test void displayNamesCanBeReusedWithUniqueKeysAndIdentities() {
        assertDoesNotThrow(()->new CareerCategory("c","category","Category",List.of(def("a","note",Instant.EPOCH),def("b","other",null))));
    }
}

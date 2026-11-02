package com.expresso.backend.career;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
import com.expresso.backend.career.application.CareerValueValidation;
import com.expresso.backend.career.domain.*;
class CustomTimestampPropertyValidationTest {
    private static final String ID="00000000-0000-4000-8000-000000000091";
    private static CareerCategory category(PropertyDefinitionType type,boolean system) {
        return new CareerCategory("category","custom","사용자 분류",List.of(new PropertyDefinition(ID,"observed","관찰 시각",type,false,system,Map.of(),0,1,null)));
    }
    private static DatePropertyValue timestamp() {
        return new DatePropertyValue(ID,DatePropertyValue.Precision.DATETIME,"2026-10-09T09:30:00.123456789+09:00",null,"Asia/Seoul");
    }
    @Test void preservesEditableCustomTimestampDefinitionsUsingCanonicalDate() {
        for(var type:List.of(PropertyDefinitionType.CREATED_TIME,PropertyDefinitionType.UPDATED_TIME)) assertDoesNotThrow(()->CareerValueValidation.validate(category(type,false),List.of(timestamp())));
    }
    @Test void systemTimestampDefinitionsRemainReadOnly() {
        for(var type:List.of(PropertyDefinitionType.CREATED_TIME,PropertyDefinitionType.UPDATED_TIME)) assertThrows(IllegalArgumentException.class,()->CareerValueValidation.validate(category(type,true),List.of(timestamp())));
    }
    @Test void customTimestampRequiresOneDatetimeInstant() {
        var category=category(PropertyDefinitionType.CREATED_TIME,false);
        assertThrows(IllegalArgumentException.class,()->CareerValueValidation.validate(category,List.of(new DatePropertyValue(ID,DatePropertyValue.Precision.DAY,"2026-10-09",null,null))));
        assertThrows(IllegalArgumentException.class,()->CareerValueValidation.validate(category,List.of(new DatePropertyValue(ID,DatePropertyValue.Precision.DATETIME,"2026-10-09T00:00:00Z","2026-10-10T00:00:00Z",null))));
        assertThrows(IllegalArgumentException.class,()->CareerValueValidation.validate(category,List.of(new CheckboxPropertyValue(ID,true))));
    }
}

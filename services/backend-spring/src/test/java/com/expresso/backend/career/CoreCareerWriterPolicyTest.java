package com.expresso.backend.career;

import static org.junit.jupiter.api.Assertions.*;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;
import com.expresso.backend.career.application.CreateCareerBusinessCommand;
import com.expresso.backend.career.application.CareerWriterPolicy;
import com.expresso.backend.career.domain.*;

class CoreCareerWriterPolicyTest {
    private static final String ID="00000000-0000-4000-8000-000000000001";
    @Test void emptyAndGroupedCreationUseOnlyBusinessInputs() {
        assertEquals(List.of(), CreateCareerBusinessCommand.empty(ID).propertyValues());
        assertThrows(IllegalArgumentException.class, () -> new CreateCareerBusinessCommand(ID, "", List.of(
                new TextualPropertyValue(ID, PropertyValueType.TEXT, "text")), CreateCareerBusinessCommand.Mode.GROUPED));
        assertThrows(IllegalArgumentException.class, () -> new CreateCareerBusinessCommand(ID, "", List.of(
                new SelectPropertyValue(ID, null)), CreateCareerBusinessCommand.Mode.GROUPED));
        assertThrows(IllegalArgumentException.class, () -> new CreateCareerBusinessCommand(ID, "", List.of(
                new MultiSelectPropertyValue(ID, List.of())), CreateCareerBusinessCommand.Mode.GROUPED));
    }
    @Test void currentStatusPolicyAllowsEveryExistingEnumWithoutInventingTransitions() {
        for(var from:CareerRecordStatus.values()) for(var to:CareerRecordStatus.values()) {
            assertDoesNotThrow(() -> CareerWriterPolicy.validateStatusTransition(from,to));
        }
    }
    @Test void exhaustedBusinessVersionCannotBeAdvancedByLifecycleMoveOrRelation() {
        var record=new CareerRecord(ID,ID,ID,"",List.of(),CareerRecordStatus.DRAFT,CareerRecord.MAX_VERSION,Instant.EPOCH);
        assertThrows(IllegalStateException.class, () -> CareerWriterPolicy.advance(record, ID, record.propertyValues(), Instant.EPOCH));
    }
}

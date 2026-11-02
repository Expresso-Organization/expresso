package com.expresso.backend.career;
import static org.junit.jupiter.api.Assertions.*;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import com.expresso.backend.career.application.*;
class CareerMoveTokensTest {
    @Test void previewIsBoundToActorVersionSchemaAndFifteenMinuteLifetime() {
        var tokens=new CareerMoveTokens("test-secret-longer-than-thirty-two-bytes");
        var issued=Instant.parse("2026-10-06T00:00:00Z"); var token=tokens.sign("actor:record:v1:schema1",issued);
        assertEquals(issued,tokens.verify(token,"actor:record:v1:schema1",issued.plusSeconds(899)));
        assertThrows(CareerCommandException.class,() -> tokens.verify(token,"other:record:v1:schema1",issued));
        assertThrows(CareerCommandException.class,() -> tokens.verify(token,"actor:record:v2:schema1",issued));
        assertThrows(CareerCommandException.class,() -> tokens.verify(token,"actor:record:v1:schema2",issued));
        assertThrows(CareerCommandException.class,() -> tokens.verify(token,"actor:record:v1:schema1",issued.plusSeconds(900)));
        assertThrows(CareerCommandException.class,() -> tokens.verify(token,"actor:record:v1:schema1",issued.minusSeconds(1)));
        assertThrows(CareerCommandException.class,() -> tokens.verify("bad.signature","actor:record:v1:schema1",issued));
    }
}

package com.expresso.backend.operations;

import static org.junit.jupiter.api.Assertions.*;
import org.junit.jupiter.api.Test;

class OperationsSettingsTest {
    static OperationsSettings settings(String bind, int port, String uri, String db, String rs,
                                       String writer, String integration, String move, String ai, String interview) {
        return new OperationsSettings(bind,port,uri,db,rs,writer,integration,move,ai,interview);
    }
    static final String URI="mongodb://127.0.0.1:59017/?replicaSet=rs0";
    @Test void loopbackAndExplicitPortAreRequired() {
        assertDoesNotThrow(() -> settings("127.0.0.1",19181,URI,"expresso","rs0","false","false","","",""));
        assertDoesNotThrow(() -> settings("::1",19181,URI,"expresso","rs0","false","false","","",""));
        for (var bind : new String[]{"","0.0.0.0","::","localhost","example.test"}) assertThrows(IllegalArgumentException.class,() -> settings(bind,19181,URI,"expresso","rs0","false","false","","",""));
        for (var port : new int[]{0,-1,65536}) assertThrows(IllegalArgumentException.class,() -> settings("127.0.0.1",port,URI,"expresso","rs0","false","false","","",""));
    }
    @Test void invalidMongoConfigurationDoesNotRevealCredentials() {
        for (var uri : new String[]{"not-a-uri-private-secret","mongodb://user:private-secret@localhost/","mongodb://user:private-secret@localhost/?replicaSet=wrong"}) {
            var error=assertThrows(IllegalArgumentException.class,() -> settings("127.0.0.1",19181,uri,"expresso","rs0","false","false","","",""));
            assertFalse(error.toString().contains("private-secret")); assertNull(error.getCause());
        }
        for (var db : new String[]{"","a b","a/b","a\\b","a.b","a$","a".repeat(64)}) assertThrows(IllegalArgumentException.class,() -> settings("127.0.0.1",19181,URI,db,"rs0","false","false","","",""));
        assertThrows(IllegalArgumentException.class,() -> settings("127.0.0.1",19181,"mongodb://localhost/other?replicaSet=rs0","expresso","rs0","false","false","","",""));
    }
    @Test void enabledWritersRequireExplicitDistinctSecretsAndConsistentFlags() {
        assertThrows(IllegalArgumentException.class,() -> settings("127.0.0.1",19181,URI,"expresso","rs0","false","true","","",""));
        assertThrows(IllegalArgumentException.class,() -> settings("127.0.0.1",19181,URI,"expresso","rs0","yes","false","","",""));
        assertThrows(IllegalArgumentException.class,() -> settings("127.0.0.1",19181,URI,"expresso","","false","false","","",""));
        assertThrows(IllegalArgumentException.class,() -> settings("127.0.0.1",19181,URI,"expresso","rs0","","false","","",""));
        assertThrows(IllegalArgumentException.class,() -> settings("127.0.0.1",19181,URI,"expresso","rs0","false","","","",""));
        assertThrows(IllegalArgumentException.class,() -> settings("127.0.0.1",19181,URI,"expresso","rs0","true","false","short","",""));
        assertThrows(IllegalArgumentException.class,() -> settings("127.0.0.1",19181,URI,"expresso","rs0","true","true","m".repeat(32),"a".repeat(32),"a".repeat(32)));
        assertDoesNotThrow(() -> settings("127.0.0.1",19181,URI,"expresso","rs0","true","true","m".repeat(32),"a".repeat(32),"i".repeat(32)));
    }
}

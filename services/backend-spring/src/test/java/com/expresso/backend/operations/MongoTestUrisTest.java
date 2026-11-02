package com.expresso.backend.operations;

import static org.junit.jupiter.api.Assertions.*;
import java.util.List;
import com.mongodb.ConnectionString;
import org.junit.jupiter.api.Test;

class MongoTestUrisTest {
    @Test void credentialReplacementPreservesHostsPortsReplicaAuthSourceAndAllQueryText() {
        var tail = "127.0.0.1:59117,localhost:59118/fixture?replicaSet=rs0&authSource=admin&tls=false&appName=pre%20fix";
        for (var original : List.of("mongodb://"+tail, "mongodb://original:old%40password@"+tail)) {
            var replaced = MongoTestUris.replaceCredentials(original,"missing+user","private:@ /+%password");
            assertTrue(replaced.endsWith(tail), "Hosts and query must be unchanged");
            assertTrue(replaced.equals("mongodb://missing%2Buser:private%3A%40%20%2F%2B%25password@"+tail), "Userinfo must be replaced once and percent encoded");
            var parsed = new ConnectionString(replaced);
            assertEquals(List.of("127.0.0.1:59117","localhost:59118"),parsed.getHosts());
            assertEquals("rs0",parsed.getRequiredReplicaSetName());
            assertEquals("admin",parsed.getCredential().getSource());
            assertTrue("missing+user".equals(parsed.getUsername()));
            assertTrue(java.util.Arrays.equals("private:@ /+%password".toCharArray(),parsed.getPassword()));
            assertNull(new ConnectionString(MongoTestUris.withoutCredentials(original)).getCredential());
        }
    }
    @Test void srvAndAUriWithoutAPathRetainTheirOriginalAuthorityAndQuery() {
        for (var uri : List.of("mongodb+srv://original:old@cluster.example.test/?replicaSet=rs0&authSource=admin", "mongodb://original:old@localhost:59117?replicaSet=rs0&authSource=admin")) {
            var replaced = MongoTestUris.replaceCredentials(uri,"missing","public-password");
            var original = new ConnectionString(uri); var parsed = new ConnectionString(replaced);
            assertEquals(original.getHosts(),parsed.getHosts());
            assertEquals(original.getRequiredReplicaSetName(),parsed.getRequiredReplicaSetName());
            assertEquals(original.getCredential().getSource(),parsed.getCredential().getSource());
            assertTrue("missing".equals(parsed.getUsername()));
        }
    }
    @Test void malformedOriginalUriIsRejectedWithoutItsCredentialText() {
        var error=assertThrows(IllegalArgumentException.class,() -> MongoTestUris.replaceCredentials("mongodb://original:private-sentinel@old:private-sentinel@localhost","missing","public-password"));
        assertFalse(error.toString().contains("private-sentinel")); assertNull(error.getCause());
    }
}

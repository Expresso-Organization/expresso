package com.expresso.backend.operations;

import java.nio.charset.StandardCharsets;
import com.mongodb.ConnectionString;

// 운영 설정 오류에는 URI나 credential 원문을 포함하지 않습니다.
final class OperationsSettings {
    final ConnectionString connection;
    final String database;
    final String replicaSet;
    final boolean writerEnabled;
    OperationsSettings(String address, int port, String uri, String database, String replicaSet,
                       String writerFlag, String integrationFlag, String moveSecret, String aiSecret, String interviewSecret) {
        if (!java.util.Set.of("127.0.0.1", "::1").contains(address)) fail("Spring bind address must be loopback");
        if (port < 1 || port > 65535) fail("Spring port must be 1..65535");
        if (database == null || database.isBlank() || database.matches(".*[ /\\\\.\"$\\x00].*") ||
                database.getBytes(StandardCharsets.UTF_8).length > 63) fail("Mongo database name is required and must be valid");
        if (replicaSet == null || !replicaSet.matches("[A-Za-z0-9_.-]+")) fail("Mongo replica set name is required");
        ConnectionString parsed;
        try { parsed = new ConnectionString(uri); }
        catch (RuntimeException error) { throw new IllegalArgumentException("Mongo runtime URI is invalid"); }
        if (!replicaSet.equals(parsed.getRequiredReplicaSetName())) fail("Mongo URI must name the configured replica set");
        if (parsed.getDatabase() != null && !database.equals(parsed.getDatabase())) fail("Mongo URI database must match runtime database");
        boolean writer = flag(writerFlag), integration = flag(integrationFlag);
        if (integration && !writer) fail("Producer integration requires the Career writer");
        if (writer) secret(moveSecret);
        if (integration) {
            secret(aiSecret); secret(interviewSecret);
            if (aiSecret.equals(interviewSecret) || aiSecret.equals(moveSecret) || interviewSecret.equals(moveSecret))
                fail("Career service actor and move secrets must be distinct");
        }
        this.connection = parsed; this.database = database; this.replicaSet = replicaSet; this.writerEnabled=writer;
    }
    OperationsSettings(String address,int port,String uri,String database,String replicaSet,
                       String writer,String integration,String move,String ai,String interview,
                       String mutation,String product,String mutationSecret) {
        this(address,port,uri,database,replicaSet,writer,integration,move,ai,interview);
        boolean mutations=flag(mutation);
        if(mutations && !writerEnabled) fail("Property mutation requires the Career writer");
        var enabled=new java.util.ArrayList<String>();
        if(writerEnabled) enabled.add(move);
        if(flag(integration)) { secret(product); enabled.add(ai);enabled.add(interview);enabled.add(product); }
        if(mutations) { secret(mutationSecret);enabled.add(mutationSecret); }
        if(new java.util.HashSet<>(enabled).size()!=enabled.size()) fail("Career service actor and move secrets must be distinct");
    }
    private static boolean flag(String value) {
        if (!"true".equals(value) && !"false".equals(value)) fail("Career enable flags must be true or false");
        return "true".equals(value);
    }
    private static void secret(String value) {
        if (value == null || value.getBytes(StandardCharsets.UTF_8).length < 32) fail("Enabled Career writers require secrets of at least 32 bytes");
    }
    private static void fail(String message) { throw new IllegalArgumentException(message); }
}

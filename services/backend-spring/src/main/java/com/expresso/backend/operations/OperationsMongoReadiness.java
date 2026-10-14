package com.expresso.backend.operations;

import java.util.List;
import java.util.concurrent.TimeUnit;
import com.mongodb.MongoClientSettings;
import com.mongodb.client.MongoClient;
import com.mongodb.client.MongoClients;
import org.bson.Document;

// Readiness는 연결과 기존 스키마를 읽기만 합니다. 시작 시 migration이나 DB write를 하지 않습니다.
final class OperationsMongoReadiness implements AutoCloseable {
    // 0014·0015·0016의 receipt 인덱스와 비교합니다. 실제 migration을 적용한 Mongo 테스트가 이 계약을 검증합니다.
    private static final List<RequiredIndex> REQUIRED_INDEXES = List.of(
            new RequiredIndex("career_command_idempotency", "career_command_actor_key", List.of("userId", "key")),
            new RequiredIndex("career_property_mutation_receipts", "career_mutation_record_receipt", List.of("userId", "mutationId", "recordId")),
            new RequiredIndex("interview_career_operations", "interview_writer_input_key", List.of("userId", "inputIdempotencyKey")));
    private record RequiredIndex(String collection, String name, List<String> keys) {
        boolean matches(Document index) {
            if (!name.equals(index.getString("name")) || !(index.get("key") instanceof Document key)) return false;
            if (!List.copyOf(key.keySet()).equals(keys)) return false;
            for (var value : key.values()) if (!(value instanceof Number number) || number.doubleValue() != 1) return false;
            return Boolean.TRUE.equals(index.getBoolean("unique")) && !index.getBoolean("sparse", false) && !index.getBoolean("hidden", false)
                    && !index.containsKey("partialFilterExpression") && !index.containsKey("expireAfterSeconds") && !index.containsKey("collation");
        }
    }
    private final MongoClient client;
    private final OperationsSettings settings;
    OperationsMongoReadiness(OperationsSettings settings) {
        this.settings = settings;
        var options = MongoClientSettings.builder().applyConnectionString(settings.connection)
                .applyToClusterSettings(b -> b.serverSelectionTimeout(2, TimeUnit.SECONDS))
                .applyToSocketSettings(b -> b.connectTimeout(2, TimeUnit.SECONDS).readTimeout(2, TimeUnit.SECONDS))
                .applyToConnectionPoolSettings(b -> b.minSize(0).maxSize(2).maxWaitTime(2, TimeUnit.SECONDS)).build();
        client = MongoClients.create(options);
    }
    boolean ready() {
        try {
            var db = client.getDatabase(settings.database);
            var hello = db.runCommand(new Document("hello", 1));
            if (!settings.replicaSet.equals(hello.getString("setName")) || !Boolean.TRUE.equals(hello.getBoolean("isWritablePrimary"))) return false;
            db.runCommand(new Document("ping", 1));
            for (var version : List.of("0014", "0015", "0016")) {
                if (db.getCollection("schema_migrations").countDocuments(new Document("_id", version).append("state", "applied")) != 1) return false;
            }
            for (var expected : REQUIRED_INDEXES) {
                boolean found = false;
                for (var index : db.getCollection(expected.collection()).listIndexes()) {
                    if (expected.matches(index)) found = true;
                }
                if (!found) return false;
            }
            return true;
        } catch (RuntimeException error) {
            // 접속·인증·조회 장애는 공개 응답에서 구분하거나 원문으로 기록하지 않습니다.
            return false;
        }
    }
    @Override public void close() { client.close(); }
}

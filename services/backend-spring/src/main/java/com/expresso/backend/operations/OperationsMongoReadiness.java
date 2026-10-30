package com.expresso.backend.operations;

import java.util.List;
import java.util.concurrent.TimeUnit;
import com.mongodb.MongoClientSettings;
import com.mongodb.client.MongoClient;
import com.mongodb.client.MongoClients;
import org.bson.Document;

// Readiness는 연결과 기존 스키마를 읽기만 합니다. 시작 시 migration이나 DB write를 하지 않습니다.
final class OperationsMongoReadiness implements AutoCloseable {
    // 0025·0026·0027의 receipt 인덱스와 비교합니다. 실제 migration을 적용한 Mongo 테스트가 이 계약을 검증합니다.
    private static final List<RequiredIndex> REQUIRED_INDEXES = List.of(
            new RequiredIndex("career_command_idempotency", "career_command_actor_key", List.of("userId", "key")),
            new RequiredIndex("career_property_mutation_receipts", "career_mutation_record_receipt", List.of("userId", "mutationId", "recordId")),
            new RequiredIndex("interview_career_operations", "interview_writer_input_key", List.of("userId", "inputIdempotencyKey")));
        private static final List<RequiredIndex> CUTOVER_INDEXES = List.of(
            new RequiredIndex("career_property_options", "career_option_scope_label", List.of("userId","categoryId","propertyId","rawLabel")),
            new RequiredIndex("career_property_options", "career_option_scope_canonical_id", List.of("userId","categoryId","propertyId","optionId")),
            new RequiredIndex("career_relation_property_tombstones", "career_relation_tombstone_current_generation", List.of("userId","recordId","propertyId")),
            new RequiredIndex("career_relation_property_tombstones", "career_relation_tombstone_deletion_generation", List.of("userId","deletionMutationId","recordId","propertyId")),
            new RequiredIndex("career_product_operations", "career_product_input_key", List.of("userId","inputIdempotencyKey")),
            new RequiredIndex("career_product_operations", "career_product_active_record", List.of("userId","recordId"), true, new Document("active",true).append("kind","patch")),
            new RequiredIndex("career_product_operations", "career_product_recovery", List.of("writerIntegration.state","writerIntegration.leaseUntil","updatedAt"), false, null),
            new RequiredIndex("career_ai_proposals", "career_ai_writer_recovery", List.of("writerIntegration.state","writerIntegration.leaseUntil","updatedAt"), false, null));
    private record RequiredIndex(String collection, String name, List<String> keys, boolean unique, Document partial) {
        RequiredIndex(String collection, String name, List<String> keys) { this(collection,name,keys,true,null); }
        boolean matches(Document index) {
            if (!name.equals(index.getString("name")) || !(index.get("key") instanceof Document key)) return false;
            if (!List.copyOf(key.keySet()).equals(keys)) return false;
            for (var value : key.values()) if (!(value instanceof Number number) || number.doubleValue() != 1) return false;
            return unique == index.getBoolean("unique", false) && !index.getBoolean("sparse", false) && !index.getBoolean("hidden", false)
                    && java.util.Objects.equals(partial,index.get("partialFilterExpression")) && !index.containsKey("expireAfterSeconds")
                    && (!index.containsKey("collation") || new Document("locale","simple").equals(index.get("collation")));
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
            for (var version : settings.writerEnabled ? List.of("0017", "0025", "0026", "0027", "0028", "0029", "0030") : List.of("0017", "0025", "0026", "0027")) {
                if (db.getCollection("schema_migrations").countDocuments(new Document("_id", version).append("state", "applied")) != 1) return false;
            }
            var required = new java.util.ArrayList<>(REQUIRED_INDEXES);
            if (settings.writerEnabled) required.addAll(CUTOVER_INDEXES);
            for (var expected : required) {
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

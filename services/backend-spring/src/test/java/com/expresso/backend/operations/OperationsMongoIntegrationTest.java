package com.expresso.backend.operations;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import java.nio.file.Path;
import java.util.UUID;
import java.util.List;
import com.mongodb.client.*;
import org.bson.Document;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.context.*;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest(properties={"SPRING_PORT=19181"})
@ActiveProfiles("operations")
@AutoConfigureMockMvc
@EnabledIfEnvironmentVariable(named="B1_TEST_MONGO_URL", matches=".+")
class OperationsMongoIntegrationTest {
    static final String DB="expresso_test_b1_java_"+UUID.randomUUID().toString().replace("-","");
    static MongoClient client;
    static MongoDatabase db;
    @Autowired MockMvc mvc;
    @DynamicPropertySource static void properties(DynamicPropertyRegistry registry) {
        registry.add("MONGODB_URL",() -> System.getenv("B1_TEST_MONGO_URL"));
        registry.add("MONGODB_DATABASE",() -> DB);
    }
    @BeforeAll static void migrate() throws Exception {
        var root=Path.of(System.getProperty("b1RepositoryRoot"));
        var process=new ProcessBuilder(System.getenv().getOrDefault("B1_TEST_NODE","node"),
                root.resolve("services/backend-spring/src/test/migrate-test-database.mjs").toString(),System.getenv("B1_TEST_MONGO_URL"),DB).inheritIO().start();
        assertEquals(0,process.waitFor());
        client=MongoClients.create(System.getenv("B1_TEST_MONGO_URL")); db=client.getDatabase(DB);
    }
    @AfterAll static void cleanup() { if (client!=null) { try { db.drop(); } finally { client.close(); } } }
    @Test void enabledCutoverRequiresExactPrivateOptionAndProductIndexesWithoutReadinessWrites() {
        var settings=new OperationsSettings("127.0.0.1",19181,System.getenv("B1_TEST_MONGO_URL"),DB,"rs0","true","false","m".repeat(32),"","");
        var options=db.getCollection("career_property_options");
        try(var readiness=new OperationsMongoReadiness(settings)) {
            assertTrue(readiness.ready());
            var original=options.listIndexes().into(new java.util.ArrayList<>()).stream().filter(index->"career_option_scope_label".equals(index.getString("name"))).findFirst().orElseThrow();
            options.dropIndex("career_option_scope_label");
            try {
                options.createIndex(new Document("categoryId",1).append("userId",1).append("propertyId",1).append("rawLabel",1),new com.mongodb.client.model.IndexOptions().unique(true).name("career_option_scope_label"));
                var before=options.listIndexes().into(new java.util.ArrayList<>());
                assertFalse(readiness.ready());assertEquals(before,options.listIndexes().into(new java.util.ArrayList<>()));
            } finally {
                options.dropIndex("career_option_scope_label");options.createIndex(original.get("key",Document.class),new com.mongodb.client.model.IndexOptions().unique(true).name("career_option_scope_label"));
            }
            assertTrue(readiness.ready());
            var products=db.getCollection("career_product_operations");products.dropIndex("career_product_active_record");
            try {
                products.createIndex(new Document("userId",1).append("recordId",1),new com.mongodb.client.model.IndexOptions().unique(true).name("career_product_active_record"));
                assertFalse(readiness.ready());
            } finally {
                products.dropIndex("career_product_active_record");products.createIndex(new Document("userId",1).append("recordId",1),new com.mongodb.client.model.IndexOptions().unique(true).partialFilterExpression(new Document("active",true).append("kind","patch")).name("career_product_active_record"));
            }
            assertTrue(readiness.ready());
        }
    }
    @Test void preparedReplicaSetIsReadyWithoutAnyWritesOrMigrationExecution() throws Exception {
        var before=db.getCollection("schema_migrations").find().into(new java.util.ArrayList<>());
        for (int i=0;i<3;i++) {
            var response=mvc.perform(get("/health/ready")).andReturn().getResponse();
            assertEquals(200,response.getStatus(),response.getContentAsString());
            assertEquals("{\"status\":\"ready\",\"checks\":{\"mongodb\":\"up\"}}",response.getContentAsString());
        }
        assertEquals(before,db.getCollection("schema_migrations").find().into(new java.util.ArrayList<>()));
        for (var collection:List.of("career_records","career_command_idempotency","outbox_events","interview_career_operations"))
            assertEquals(0,db.getCollection(collection).countDocuments());
    }
    @Test void missingMigrationFailsReadyWhileLivenessRemainsAvailableAndSchemaStaysMissing() throws Exception {
        var migrations=db.getCollection("schema_migrations"); var filter=new Document("_id","0016"); var original=migrations.find(filter).first();
        try {
            migrations.deleteOne(filter);
            assertEquals(503,mvc.perform(get("/health/ready")).andReturn().getResponse().getStatus());
            assertEquals(200,mvc.perform(get("/health/live")).andReturn().getResponse().getStatus());
            assertNull(migrations.find(filter).first());
        } finally { migrations.insertOne(original); }
    }
    @Test void missingReceiptIndexFailsReadinessWithoutRecreatingIt() throws Exception {
        var receipts=db.getCollection("career_command_idempotency");
        receipts.dropIndex("career_command_actor_key");
        try {
            assertEquals(503,mvc.perform(get("/health/ready")).andReturn().getResponse().getStatus());
            assertFalse(receipts.listIndexes().into(new java.util.ArrayList<>()).stream().anyMatch(index -> "career_command_actor_key".equals(index.getString("name"))));
        } finally { receipts.createIndex(new Document("userId",1).append("key",1),new com.mongodb.client.model.IndexOptions().unique(true).name("career_command_actor_key")); }
    }
    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(booleans={false,true})
    void invalidMongoCredentialFailsReadinessAfterActualAuthenticationRejection(boolean existingCredential) {
        var root=System.getenv("B1_TEST_MONGO_URL");
        var original=existingCredential ? root : MongoTestUris.withoutCredentials(root);
        if (existingCredential && new com.mongodb.ConnectionString(original).getCredential()==null)
            original=MongoTestUris.replaceCredentials(original,"original-fixture-user","public-fixture-password");
        var raw=MongoTestUris.replaceCredentials(original,"missing-pre-fix-user","disposable-public-rejected-password");
        var before=new com.mongodb.ConnectionString(original); var after=new com.mongodb.ConnectionString(raw);
        assertEquals(before.getHosts(),after.getHosts());
        assertEquals(before.getRequiredReplicaSetName(),after.getRequiredReplicaSetName());
        assertEquals(before.getDatabase(),after.getDatabase());
        try (var rejected=MongoClients.create(raw)) {
            var error=assertThrows(com.mongodb.MongoSecurityException.class,() -> rejected.getDatabase(DB).runCommand(new Document("ping",1)));
            assertTrue(error.getCause() instanceof com.mongodb.MongoCommandException);
            assertEquals(18,((com.mongodb.MongoCommandException)error.getCause()).getErrorCode());
            assertFalse(error.toString().contains("disposable-public-rejected-password"));
        }
        var settings=new OperationsSettings("127.0.0.1",19181,raw,DB,"rs0","false","false","","","");
        try (var readiness=new OperationsMongoReadiness(settings)) { assertFalse(readiness.ready()); }
    }
    @Test void enabledDisposableProfilePreservesHttpServiceActorAuthenticationAndHealthIsolation() throws Exception {
        int port;
        try (var socket=new java.net.ServerSocket(0,0,java.net.InetAddress.getLoopbackAddress())) { port=socket.getLocalPort(); }
        var properties=new java.util.HashMap<String,Object>();
        properties.put("SPRING_PORT",Integer.toString(port)); properties.put("MONGODB_URL",System.getenv("B1_TEST_MONGO_URL")); properties.put("MONGODB_DATABASE",DB);
        properties.put("CAREER_WRITER_ENABLED","true"); properties.put("CAREER_INTEGRATION_ENABLED","true");
        properties.put("CAREER_PRODUCT_SERVICE_SECRET","disposable-operations-product-secret-32-bytes");
        properties.put("CAREER_PROPERTY_MUTATION_ENABLED","true");properties.put("CAREER_PROPERTY_MUTATION_SECRET","disposable-operations-mutation-secret-32-bytes");
        properties.put("CAREER_WRITER_MOVE_SECRET","disposable-operations-move-secret-32-bytes");
        properties.put("CAREER_INTEGRATION_AI_SECRET","disposable-operations-ai-secret-32-bytes");
        properties.put("CAREER_INTEGRATION_INTERVIEW_SECRET","disposable-operations-interview-secret-32-bytes");
        try (var context=new org.springframework.boot.builder.SpringApplicationBuilder(com.expresso.backend.BackendSpringApplication.class).profiles("operations").properties(properties).run()) {
            var http=java.net.http.HttpClient.newHttpClient(); var base="http://127.0.0.1:"+port;
            for (var endpoint:List.of("/health/live","/health/ready")) {
                var request=java.net.http.HttpRequest.newBuilder(java.net.URI.create(base+endpoint)).header("Authorization","Bearer invalid-token").GET().build();
                assertEquals(200,http.send(request,java.net.http.HttpResponse.BodyHandlers.ofString()).statusCode());
            }
            var id="00000000-0000-4000-8000-000000000001";
            db.getCollection("users").insertOne(new Document("_id",id).append("email","operations@example.test").append("displayName","operations").append("planId",id).append("createdAt",new java.util.Date()).append("deletionRequestedAt",null));
            var claims=new Document("producer","ai-proposal").append("userId",id).append("sourceId",id).append("operationId",id).append("fingerprint","a".repeat(64))
                    .append("audience","career-producer").append("expiresAt",java.time.Instant.now().plusSeconds(60).toString());
            var encoded=java.util.Base64.getUrlEncoder().withoutPadding().encodeToString(claims.toJson().getBytes(java.nio.charset.StandardCharsets.UTF_8));
            var mac=javax.crypto.Mac.getInstance("HmacSHA256"); mac.init(new javax.crypto.spec.SecretKeySpec("disposable-operations-ai-secret-32-bytes".getBytes(java.nio.charset.StandardCharsets.UTF_8),"HmacSHA256"));
            var token="expi."+encoded+"."+java.util.Base64.getUrlEncoder().withoutPadding().encodeToString(mac.doFinal(encoded.getBytes(java.nio.charset.StandardCharsets.US_ASCII)));
            var body=new Document("producer","ai-proposal").append("userId",id).append("sourceId",id).append("operationId",id).append("fingerprint","a".repeat(64)).append("leaseToken",id);
            for (var invalid:List.of("invalid-credential","exps_"+"A".repeat(43))) assertEquals(401,post(http,base,invalid,body.toJson()).statusCode());
            var denied=post(http,base,token,new Document(body).append("fingerprint","b".repeat(64)).toJson());
            assertEquals(403,denied.statusCode());
            var authenticated=post(http,base,token,body.toJson());
            assertEquals(404,authenticated.statusCode(),authenticated.body());
            assertFalse(authenticated.body().contains(token));
            assertEquals(0,db.getCollection("career_command_idempotency").countDocuments());
            assertEquals(0,db.getCollection("outbox_events").countDocuments());
            assertFalse(db.getCollection("users").find(new Document("_id",id)).first().containsKey("writeVersion"));
            db.getCollection("users").deleteOne(new Document("_id",id));
        }
    }
    private static java.net.http.HttpResponse<String> post(java.net.http.HttpClient http,String base,String token,String body) throws Exception {
        var request=java.net.http.HttpRequest.newBuilder(java.net.URI.create(base+"/internal/career/integration/business")).header("Content-Type","application/json").header("Authorization","Bearer "+token)
                .POST(java.net.http.HttpRequest.BodyPublishers.ofString(body)).build();
        return http.send(request,java.net.http.HttpResponse.BodyHandlers.ofString());
    }
    static java.util.stream.Stream<org.junit.jupiter.params.provider.Arguments> indexDrifts() {
        return java.util.stream.Stream.of(
                new String[]{"career_command_idempotency","career_command_actor_key"},
                new String[]{"career_property_mutation_receipts","career_mutation_record_receipt"},
                new String[]{"interview_career_operations","interview_writer_input_key"})
                .flatMap(index -> java.util.stream.Stream.of("key","order","unique","partial","sparse","collation","hidden")
                        .map(drift -> org.junit.jupiter.params.provider.Arguments.of(index[0],index[1],drift)));
    }
    @org.junit.jupiter.params.ParameterizedTest(name="{0} rejects {2} drift")
    @org.junit.jupiter.params.provider.MethodSource("indexDrifts")
    void sameNamedIndexDriftFailsReadinessWithoutRewritingTheIndex(String collection,String name,String drift) throws Exception {
        var coll=db.getCollection(collection);
        var original=coll.listIndexes().into(new java.util.ArrayList<>()).stream().filter(index -> name.equals(index.getString("name"))).findFirst().orElseThrow();
        var keys=new Document(original.get("key",Document.class));
        var options=new com.mongodb.client.model.IndexOptions().name(name).unique(true);
        switch(drift) {
            case "key" -> keys=new Document("unexpectedKey",1);
            case "order" -> {
                var reversed=new java.util.ArrayList<>(keys.entrySet()); java.util.Collections.reverse(reversed);
                keys=new Document(); for(var entry:reversed) keys.append(entry.getKey(),entry.getValue());
            }
            case "unique" -> options.unique(false);
            case "partial" -> options.partialFilterExpression(new Document("userId",new Document("$exists",true)));
            case "sparse" -> options.sparse(true);
            case "collation" -> options.collation(com.mongodb.client.model.Collation.builder().locale("en").build());
            case "hidden" -> options.hidden(true);
            default -> throw new IllegalArgumentException("Unknown fixture");
        }
        coll.dropIndex(name);
        try {
            coll.createIndex(keys,options);
            var before=coll.listIndexes().into(new java.util.ArrayList<>());
            var response=mvc.perform(get("/health/ready")).andReturn().getResponse();
            assertEquals(503,response.getStatus());
            assertEquals(before,coll.listIndexes().into(new java.util.ArrayList<>()));
            assertEquals(200,mvc.perform(get("/health/live")).andReturn().getResponse().getStatus());
        } finally {
            if(coll.listIndexes().into(new java.util.ArrayList<>()).stream().anyMatch(index -> name.equals(index.getString("name")))) coll.dropIndex(name);
            coll.createIndex(original.get("key",Document.class),new com.mongodb.client.model.IndexOptions().name(name).unique(true));
        }
        assertEquals(200,mvc.perform(get("/health/ready")).andReturn().getResponse().getStatus());
    }
}

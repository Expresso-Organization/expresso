package com.expresso.backend.career;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import java.nio.file.*;
import java.time.*;
import java.util.*;
import org.bson.Document;
import org.bson.types.Decimal128;
import com.mongodb.client.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import com.expresso.backend.career.application.*;
import com.expresso.backend.career.domain.CareerRecord;

@SpringBootTest(properties={"career.writer.enabled=true", "spring.main.web-application-type=servlet", "career.writer.move-secret=disposable-test-secret-with-at-least-32-bytes"})
@AutoConfigureMockMvc
@EnabledIfEnvironmentVariable(named="B1_TEST_MONGO_URL", matches=".+")
class CareerWriterMongoIntegrationTest {
    static final String DB = "expresso_test_b1_java_" + UUID.randomUUID().toString().replace("-", "");
    static final String USER=id(2), CATEGORY=id(3), OTHER=id(4), TARGET=id(5), REL=id(71), INVERSE=id(72);
    static final String TOKEN="exps_"+"A".repeat(43), TOKEN2="exps_"+"B".repeat(43);
    static final String PATH="/v1/career/records";
    static final JsonMapper JSON=JsonMapper.builder().build();
    static MongoClient client; static MongoDatabase db;
    @Autowired MockMvc mvc;
    @Autowired com.expresso.backend.career.infrastructure.mongo.MongoCareerCommandRepository repository;
    @DynamicPropertySource static void properties(DynamicPropertyRegistry registry) {
        registry.add("career.writer.mongo-uri", () -> System.getenv("B1_TEST_MONGO_URL"));
        registry.add("career.writer.database", () -> DB);
    }
    @BeforeAll static void migrate() throws Exception {
        var root=Path.of(System.getProperty("b1RepositoryRoot"));
        var node=System.getenv().getOrDefault("B1_TEST_NODE", "node");
        var process=new ProcessBuilder(node, root.resolve("services/backend-spring/src/test/migrate-test-database.mjs").toString(), System.getenv("B1_TEST_MONGO_URL"), DB).inheritIO().start();
        assertEquals(0, process.waitFor());
        client=MongoClients.create(System.getenv("B1_TEST_MONGO_URL")); db=client.getDatabase(DB);
    }
    @AfterAll static void cleanup() {
        if(client!=null) { try { db.drop(); } finally {client.close();} }
    }
    @BeforeEach void seed() throws Exception {
        for(var collection:List.of("career_property_options","career_property_mutations","career_records","career_record_relations","outbox_events","career_command_idempotency","identity_sessions","users","career_document_snapshots","career_document_updates","career_record_revisions")) db.getCollection(collection).deleteMany(new Document());
        db.getCollection("career_categories").deleteMany(new Document("_id",new Document("$in",List.of(CATEGORY,TARGET))));
        for(var user:List.of(USER,OTHER)) db.getCollection("users").insertOne(new Document("_id",user).append("email",user+"@example.test").append("displayName","tester").append("planId",id(91)).append("createdAt",new Date()).append("deletionRequestedAt",null));
        session(USER,TOKEN); session(OTHER,TOKEN2);
        var defs=new ArrayList<Document>();
        for(var value:fixture().get("data").get("propertyValues")) {
            var type=value.get("type").asText();
            var config=Set.of("select","multi_select").contains(type) ? new Document("options",List.of(new Document("id",id(81)).append("name","A"),new Document("id",id(82)).append("name","B"))) : new Document();
            defs.add(def(value.get("propertyDefinitionId").asText(), "p"+defs.size(),type,config));
        }
        defs.add(def(REL,"relation","relation",new Document("targetCategoryId",TARGET).append("inversePropertyId",INVERSE).append("cardinality","multiple").append("deletePolicy","nullify")));
        category(CATEGORY,defs);
        category(TARGET,List.of(def(INVERSE,"inverse","relation",new Document("targetCategoryId",CATEGORY).append("inversePropertyId",REL).append("cardinality","single").append("deletePolicy","nullify"))));
    }
    static String id(int number) { return String.format("00000000-0000-4000-8000-%012d",number); }
    static Document def(String id,String key,String type,Document config) {return new Document("id",id).append("key",key).append("name",key).append("type",type).append("required",false).append("system",false).append("config",config).append("order",0).append("version",1L).append("deletedAt",null);}
    static void category(String id,List<Document> defs) { db.getCollection("career_categories").insertOne(new Document("_id",id).append("key","test"+id.substring(30)).append("userId",USER).append("isSystem",false).append("name","test").append("icon","folder").append("defaultView","list").append("sortOrder",0).append("propertySchema",new Document()).append("propertySchemaV2",defs).append("schemaVersion",1L).append("version",1L).append("updatedAt",new Date())); }
    static void session(String user,String token) { db.getCollection("identity_sessions").insertOne(new Document("_id",UUID.randomUUID().toString()).append("userId",user).append("tokenHash",CareerMoveTokens.hash(token)).append("expiresAt",Date.from(Instant.now().plusSeconds(3600))).append("createdAt",new Date()).append("revokedAt",null)); }
    static JsonNode fixture() throws Exception {return JSON.readTree(Files.readString(Path.of(System.getProperty("careerBusinessFixture"))));}
    JsonNode call(MockHttpServletRequestBuilder request,int status) throws Exception {
        var result=mvc.perform(request.header("Authorization","Bearer "+TOKEN).contentType("application/json")).andReturn();
        assertEquals(status,result.getResponse().getStatus(),result.getResponse().getContentAsString());
        if(status<300 && result.getResponse().getHeader("ETag")!=null) {
            var node=JSON.readTree(result.getResponse().getContentAsString());
            assertEquals("\"v"+node.get("data").get("version").asLong()+"\"",result.getResponse().getHeader("ETag"));
        }
        return JSON.readTree(result.getResponse().getContentAsString());
    }
    JsonNode create(String category,String suffix) throws Exception {return call(post(PATH).header("Idempotency-Key","b1-create-key-"+suffix).content("{\"categoryId\":\""+category+"\"}"),201).get("data");}
    Document stored(String id) {return db.getCollection("career_records").find(new Document("_id",id)).first();}
    void protectDocument(String id) {
        db.getCollection("career_records").updateOne(new Document("_id",id),new Document("$set",new Document("bodyMd","DOCUMENT-OWNER").append("blockBody",List.of(new Document("unknown","opaque"))).append("documentVersion",7L).append("latestSnapshotId",id(93)).append("properties",new Document("legacy","keep"))));
        db.getCollection("career_document_snapshots").insertOne(new Document("_id",UUID.randomUUID().toString()).append("userId",USER).append("recordId",id).append("documentVersion",7L).append("version",7L).append("schemaVersion",1L).append("content",new Document("opaque","document-owned")).append("stateVector",new org.bson.types.Binary(new byte[]{1,2})).append("serverSequence",7L).append("checksum","a".repeat(64)).append("actor","user").append("createdAt",Date.from(Instant.EPOCH)));
        db.getCollection("career_document_updates").insertOne(new Document("_id",UUID.randomUUID().toString()).append("userId",USER).append("recordId",id).append("clientId","document-client").append("clientSequence",1L).append("serverSequence",8L).append("update",new org.bson.types.Binary(new byte[]{3,4})).append("byteLength",2).append("updateHash","b".repeat(64)).append("actor","user").append("receivedAt",Date.from(Instant.EPOCH)).append("compactedAt",null));
        db.getCollection("career_record_revisions").insertOne(new Document("_id",UUID.randomUUID().toString()).append("userId",USER).append("recordId",id).append("actor","user").append("summary","sentinel").append("beforeVersion",6L).append("afterVersion",7L).append("createdAt",Date.from(Instant.EPOCH)));
    }
    void assertDocument(String id) {
        var record=stored(id); assertEquals("DOCUMENT-OWNER",record.getString("bodyMd")); assertEquals(7L,record.getLong("documentVersion")); assertEquals(id(93),record.getString("latestSnapshotId"));
        assertEquals(List.of(new Document("unknown","opaque")),record.get("blockBody")); assertEquals(new Document("legacy","keep"),record.get("properties"));
        var query=new Document("recordId",id);
        for(var name:List.of("career_document_snapshots","career_document_updates","career_record_revisions")) assertEquals(1,db.getCollection(name).countDocuments(query));
        var snapshot=db.getCollection("career_document_snapshots").find(query).first(); assertEquals(new Document("opaque","document-owned"),snapshot.get("content")); assertEquals(7L,snapshot.getLong("documentVersion")); assertEquals(new org.bson.types.Binary(new byte[]{1,2}),snapshot.get("stateVector"));
        assertEquals(new org.bson.types.Binary(new byte[]{3,4}),db.getCollection("career_document_updates").find(query).first().get("update"));
    }
    @Test void createReplayCollisionAndStorageCompatibility() throws Exception {
        var created=create(CATEGORY,"replay"); var rid=created.get("id").asText();
        assertEquals(created,create(CATEGORY,"replay")); assertEquals(1,db.getCollection("career_records").countDocuments());
        var raw=stored(rid); assertEquals("",raw.get("bodyMd")); assertEquals(new Document(),raw.get("properties"));
        assertFalse(raw.containsKey("blockBody")); assertFalse(raw.containsKey("documentVersion"));
        call(post(PATH).header("Idempotency-Key","b1-create-key-replay").content("{\"categoryId\":\""+TARGET+"\"}"),409);
        call(post(PATH).header("Idempotency-Key","b1-create-key-invalid").content("{\"categoryId\":\""+CATEGORY+"\",\"bodyMd\":\"forbidden\"}"),400);
        var foreign=mvc.perform(post(PATH).header("Authorization","Bearer "+TOKEN2).header("Idempotency-Key","b1-create-key-foreign").contentType("application/json").content("{\"categoryId\":\""+CATEGORY+"\"}")).andReturn(); assertEquals(404,foreign.getResponse().getStatus());
    }
    @Test void titleNoopStaleOwnershipAndSafeVersion() throws Exception {
        var rid=create(CATEGORY,"title").get("id").asText(); protectDocument(rid);
        assertEquals(1,call(patch(PATH+"/"+rid).header("If-Match","\"v1\"").content("{\"title\":\"\"}"),200).get("data").get("version").asLong());
        assertEquals(2,call(patch(PATH+"/"+rid).header("If-Match","\"v1\"").content("{\"title\":\"changed\"}"),200).get("data").get("version").asLong());
        call(patch(PATH+"/"+rid).header("If-Match","\"v1\"").content("{\"title\":\"lost\"}"),412);
        var foreign=mvc.perform(patch(PATH+"/"+rid).header("Authorization","Bearer "+TOKEN2).header("If-Match","\"v2\"").contentType("application/json").content("{\"title\":\"foreign\"}")).andReturn(); assertEquals(404,foreign.getResponse().getStatus());
        db.getCollection("career_records").updateOne(new Document("_id",rid),new Document("$set",new Document("version",CareerRecord.MAX_VERSION)));
        call(patch(PATH+"/"+rid).header("If-Match","\"v"+CareerRecord.MAX_VERSION+"\"").content("{\"title\":\"changed\"}"),200);
        call(patch(PATH+"/"+rid).header("If-Match","\"v"+CareerRecord.MAX_VERSION+"\"").content("{\"title\":\"overflow\"}"),409);
        assertEquals(CareerRecord.MAX_VERSION,stored(rid).getLong("version")); assertDocument(rid);
    }
    @Test void allCanonicalValuesRoundTripAndOutboxRollback() throws Exception {
        var rid=create(CATEGORY,"values").get("id").asText(); protectDocument(rid);
        var values=fixture().get("data").get("propertyValues");
        var response=call(patch(PATH+"/"+rid).header("If-Match","\"v1\"").content(delta(values.toString(),List.of())),200);
        assertEquals(values,response.get("data").get("propertyValues"));
        assertEquals(new Decimal128(new java.math.BigDecimal("12345678901234567890.123400")),stored(rid).getList("propertyValues",Document.class).get(1).get("value"));
        assertEquals(1,db.getCollection("outbox_events").countDocuments());
        db.runCommand(new Document("collMod","outbox_events").append("validator",new Document("$expr",new Document("$eq",List.of(1,0)))));
        try {
            var unset=new ArrayList<String>(); values.forEach(value -> unset.add(value.get("propertyDefinitionId").asText()));
            call(patch(PATH+"/"+rid).header("If-Match","\"v2\"").content(delta("[]",unset)),500);
            assertEquals(2L,stored(rid).getLong("version")); assertEquals(values,response.get("data").get("propertyValues")); assertEquals(1,db.getCollection("outbox_events").countDocuments());
        } finally {
            var schema=JSON.readTree(Files.readString(Path.of(System.getProperty("b1RepositoryRoot"),"packages/database/src/mongodb-migrations/0001/schema.json")));
            for(var collection:schema) if(collection.get("name").asText().equals("outbox_events")) db.runCommand(new Document("collMod","outbox_events").append("validator",Document.parse(collection.get("validator").toString())));
        }
        assertDocument(rid);
    }
    @Test void groupedAndDuplicateBusinessCreatesValidateDefinitions() throws Exception {
        var group="{\"categoryId\":\""+CATEGORY+"\",\"propertyValues\":[{\"propertyDefinitionId\":\""+id(14)+"\",\"type\":\"select\",\"value\":\""+id(81)+"\"}]}";
        var grouped=call(post(PATH).header("Idempotency-Key","b1-grouped-create-key").content(group),201).get("data");
        assertEquals(1,grouped.get("propertyValues").size());
        var copy="{\"categoryId\":\""+CATEGORY+"\",\"title\":\"business copy\",\"propertyValues\":"+fixture().get("data").get("propertyValues")+"}";
        var duplicate=call(post(PATH).header("Idempotency-Key","b1-duplicate-create-key").content(copy),201).get("data");
        assertEquals("business copy",duplicate.get("title").asText()); assertEquals(fixture().get("data").get("propertyValues"),duplicate.get("propertyValues"));
        var bad=group.replace(id(81),id(99)); call(post(PATH).header("Idempotency-Key","b1-grouped-invalid-key").content(bad),400);
    }
    @Test void statusTrashRestorePreserveDocumentsAndReferenceGuard() throws Exception {
        var rid=create(CATEGORY,"lifecycle").get("id").asText(); protectDocument(rid);
        var version=1L;
        for(var status:List.of("verified","draft","organized")) {
            var changed=call(patch(PATH+"/"+rid).header("If-Match","\"v"+version+"\"").content("{\"status\":\""+status+"\"}"),200); assertEquals(++version,changed.get("data").get("version").asLong());
        }
        call(patch(PATH+"/"+rid).header("If-Match","\"v4\"").content("{\"status\":\"published\"}"),400);
        call(patch(PATH+"/"+rid).header("If-Match","\"v1\"").content("{\"status\":\"draft\"}"),412);
        call(delete(PATH+"/"+rid).header("If-Match","\"v4\""),200);
        assertNotNull(stored(rid).getDate("deletedAt")); assertEquals(1L,stored(rid).getLong("referenceVersion"));
        call(patch(PATH+"/"+rid).header("If-Match","\"v5\"").content("{\"title\":\"deleted\"}"),404);
        call(post(PATH+"/"+rid+"/restore").header("If-Match","\"v4\""),412);
        call(post(PATH+"/"+rid+"/restore").header("If-Match","\"v5\""),200);
        assertNull(stored(rid).get("deletedAt")); assertEquals(2L,stored(rid).getLong("referenceVersion"));
        call(post(PATH+"/"+rid+"/restore").header("If-Match","\"v6\""),404);
        call(delete(PATH+"/"+rid).header("If-Match","\"v6\""),200);
        db.getCollection("career_records").updateOne(new Document("_id",rid),new Document("$set",new Document("purgeAfter",Date.from(Instant.EPOCH))));
        call(post(PATH+"/"+rid+"/restore").header("If-Match","\"v7\""),409); assertDocument(rid);
    }
    @Test void movePreviewCommitPreservesUnmappedAndRejectsSchemaDrift() throws Exception {
        var rid=create(CATEGORY,"move").get("id").asText(); protectDocument(rid);
        var values=fixture().get("data").get("propertyValues");
        call(patch(PATH+"/"+rid).header("If-Match","\"v1\"").content(delta(values.toString(),List.of())),200);
        var input="{\"targetCategoryId\":\""+TARGET+"\"}";
        var preview=call(post(PATH+"/"+rid+"/move/preview").header("If-Match","\"v2\"").content(input),200).get("data");
        assertEquals(values.size(),preview.get("unmappedPropertyIds").size());
        var commit="{\"targetCategoryId\":\""+TARGET+"\",\"previewToken\":\""+preview.get("previewToken").asText()+"\"}";
        db.getCollection("career_categories").updateOne(new Document("_id",TARGET),new Document("$inc",new Document("schemaVersion",1L)));
        call(post(PATH+"/"+rid+"/move").header("If-Match","\"v2\"").content(commit),409);
        var fresh=call(post(PATH+"/"+rid+"/move/preview").header("If-Match","\"v2\"").content(input),200).get("data");
        commit="{\"targetCategoryId\":\""+TARGET+"\",\"previewToken\":\""+fresh.get("previewToken").asText()+"\"}";
        var moved=call(post(PATH+"/"+rid+"/move").header("If-Match","\"v2\"").content(commit),200).get("data");
        assertEquals(TARGET,moved.get("categoryId").asText()); assertEquals(3,moved.get("version").asLong()); assertEquals(0,moved.get("propertyValues").size());
        assertEquals(values.size(),stored(rid).get("unmappedProperties",Document.class).size());
        var number=stored(rid).get("unmappedProperties",Document.class).get(id(12),Document.class).get("propertyValue",Document.class);
        assertEquals(new Decimal128(new java.math.BigDecimal("12345678901234567890.123400")),number.get("value"));
        call(post(PATH+"/"+rid+"/move").header("If-Match","\"v2\"").content(commit),412); assertDocument(rid);
    }
    @Test void relationInverseNoopStaleAndRemovalAreAtomic() throws Exception {
        var source=create(CATEGORY,"rel-source").get("id").asText(); var target=create(TARGET,"rel-target").get("id").asText(); protectDocument(source); protectDocument(target);
        var input="{\"propertyId\":\""+REL+"\",\"targetIds\":[\""+target+"\",\""+target+"\"]}";
        call(put(PATH+"/"+source+"/relations").header("If-Match","\"v1\"").content(input),200);
        assertEquals(2,db.getCollection("career_record_relations").countDocuments()); assertEquals(2,db.getCollection("outbox_events").countDocuments()); assertEquals(1L,stored(target).getLong("version"));
        var ref=stored(source).getLong("referenceVersion");
        assertEquals(2,call(put(PATH+"/"+source+"/relations").header("If-Match","\"v2\"").content(input),200).get("data").get("version").asLong()); assertEquals(ref,stored(source).getLong("referenceVersion"));
        call(put(PATH+"/"+source+"/relations").header("If-Match","\"v1\"").content(input),412);
        var second=create(CATEGORY,"rel-second").get("id").asText();
        call(put(PATH+"/"+second+"/relations").header("If-Match","\"v1\"").content(input),409); assertEquals(1L,stored(second).getLong("version"));
        var clear="{\"propertyId\":\""+REL+"\",\"targetIds\":[]}";
        call(put(PATH+"/"+source+"/relations").header("If-Match","\"v2\"").content(clear),200);
        assertEquals(0,db.getCollection("career_record_relations").countDocuments()); assertEquals(4,db.getCollection("outbox_events").countDocuments()); assertDocument(source); assertDocument(target);
    }
    @Test void concurrentCreatesReplayOneCommittedResponse() throws Exception {
        try(var executor=java.util.concurrent.Executors.newFixedThreadPool(2)) {
            var latch=new java.util.concurrent.CountDownLatch(1);
            var first=executor.submit(() -> {latch.await();return create(CATEGORY,"concurrent");}); var second=executor.submit(() -> {latch.await();return create(CATEGORY,"concurrent");}); latch.countDown();
            assertEquals(first.get(),second.get()); assertEquals(1,db.getCollection("career_records").countDocuments()); assertEquals(1,db.getCollection("career_command_idempotency").countDocuments());
        }
    }
    @Test void concurrentCasHasExactlyOneWinner() throws Exception {
        var rid=create(CATEGORY,"cas").get("id").asText();
        try(var executor=java.util.concurrent.Executors.newFixedThreadPool(2)) {
            var latch=new java.util.concurrent.CountDownLatch(1); var results=new ArrayList<java.util.concurrent.Future<Integer>>();
            for(var title:List.of("first","second")) results.add(executor.submit(() -> {latch.await();return mvc.perform(patch(PATH+"/"+rid).header("Authorization","Bearer "+TOKEN).header("If-Match","\"v1\"").contentType("application/json").content("{\"title\":\""+title+"\"}")).andReturn().getResponse().getStatus();}));
            latch.countDown(); var statuses=new ArrayList<Integer>(); for(var result:results) statuses.add(result.get()); Collections.sort(statuses); assertEquals(List.of(200,412),statuses); assertEquals(2L,stored(rid).getLong("version"));
        }
    }
    @Test void incomingOnlyInverseRelationClearAndReplaceRemoveTheOriginalRowOnce() throws Exception {
        for(var replace:List.of(false,true)){
            seed();var source=create(CATEGORY,"incoming-source").get("id").asText();var target=create(TARGET,"incoming-target").get("id").asText();var other=create(CATEGORY,"incoming-other").get("id").asText();
            call(put(PATH+"/"+source+"/relations").header("If-Match","\"v1\"").content(new Document("propertyId",REL).append("targetIds",List.of(target)).toJson()),200);
            db.getCollection("career_record_relations").deleteMany(new Document("sourceRecordId",target));db.getCollection("outbox_events").deleteMany(new Document());var original=db.getCollection("career_record_relations").find().first();
            var targets=replace?List.of(other):List.<String>of();var result=call(put(PATH+"/"+target+"/relations").header("If-Match","\"v1\"").content(new Document("propertyId",INVERSE).append("targetIds",targets).toJson()),200);
            assertEquals(2,result.get("data").get("version").asLong());assertNull(db.getCollection("career_record_relations").find(new Document("_id",original.getString("_id"))).first());assertEquals(replace?2:0,db.getCollection("career_record_relations").countDocuments());assertEquals(2L,stored(source).getLong("version"));assertEquals(1L,stored(other).getLong("version"));assertEquals(replace?3:2,db.getCollection("outbox_events").countDocuments());
            var before=unidirectionalWriterState();call(put(PATH+"/"+target+"/relations").header("If-Match","\"v2\"").content(new Document("propertyId",INVERSE).append("targetIds",targets).toJson()),200);var noOp=unidirectionalWriterState();for(var collection:List.of("career_records","career_record_relations","outbox_events"))assertEquals(before.get(collection),noOp.get(collection));
        }
    }
    @Test void incomingOnlyInverseRelationConcurrentClearAndReplaceHaveOneCasWinner() throws Exception {
        var source=create(CATEGORY,"incoming-race-source").get("id").asText();var target=create(TARGET,"incoming-race-target").get("id").asText();var other=create(CATEGORY,"incoming-race-other").get("id").asText();
        call(put(PATH+"/"+source+"/relations").header("If-Match","\"v1\"").content(new Document("propertyId",REL).append("targetIds",List.of(target)).toJson()),200);
        db.getCollection("career_record_relations").deleteMany(new Document("sourceRecordId",target));db.getCollection("outbox_events").deleteMany(new Document());var original=db.getCollection("career_record_relations").find().first();
        try(var executor=java.util.concurrent.Executors.newVirtualThreadPerTaskExecutor()){
            var gate=new java.util.concurrent.CountDownLatch(1);var results=new ArrayList<java.util.concurrent.Future<Integer>>();
            for(var targets:List.of(List.<String>of(),List.of(other)))results.add(executor.submit(()->{gate.await();return mvc.perform(put(PATH+"/"+target+"/relations").header("Authorization","Bearer "+TOKEN).header("If-Match","\"v1\"").contentType("application/json").content(new Document("propertyId",INVERSE).append("targetIds",targets).toJson())).andReturn().getResponse().getStatus();}));
            gate.countDown();var statuses=new ArrayList<Integer>();for(var result:results)statuses.add(result.get());Collections.sort(statuses);assertEquals(List.of(200,412),statuses);
        }
        assertEquals(2L,stored(target).getLong("version"));assertEquals(2L,stored(source).getLong("version"));assertNull(db.getCollection("career_record_relations").find(new Document("_id",original.getString("_id"))).first());var edges=db.getCollection("career_record_relations").countDocuments();assertTrue(edges==0||edges==2);assertEquals(edges==0?2:3,db.getCollection("outbox_events").countDocuments());
    }
    @Test void incomingOnlyInverseSingleCardinalityRejectsASecondSource() throws Exception {
        var source=create(CATEGORY,"incoming-single-source").get("id").asText();var target=create(TARGET,"incoming-single-target").get("id").asText();var other=create(CATEGORY,"incoming-single-other").get("id").asText();
        call(put(PATH+"/"+source+"/relations").header("If-Match","\"v1\"").content(new Document("propertyId",REL).append("targetIds",List.of(target)).toJson()),200);db.getCollection("career_record_relations").deleteMany(new Document("sourceRecordId",target));var before=unidirectionalWriterState();
        call(put(PATH+"/"+other+"/relations").header("If-Match","\"v1\"").content(new Document("propertyId",REL).append("targetIds",List.of(target)).toJson()),409);assertEquals(before,unidirectionalWriterState());
    }
    @Test void authenticationRejectsExpiredRevokedMissingAndDeletingUsers() throws Exception {
        var request="{\"categoryId\":\""+CATEGORY+"\"}";
        assertEquals(401,mvc.perform(post(PATH).header("Idempotency-Key","b1-no-session-key").contentType("application/json").content(request)).andReturn().getResponse().getStatus());
        db.getCollection("identity_sessions").updateOne(new Document("userId",USER),new Document("$set",new Document("expiresAt",Date.from(Instant.EPOCH))));
        call(post(PATH).header("Idempotency-Key","b1-expired-session-key").content(request),401);
        db.getCollection("identity_sessions").updateOne(new Document("userId",USER),new Document("$set",new Document("expiresAt",Date.from(Instant.now().plusSeconds(3600))).append("revokedAt",new Date())));
        call(post(PATH).header("Idempotency-Key","b1-revoked-session-key").content(request),401);
        db.getCollection("identity_sessions").updateOne(new Document("userId",USER),new Document("$set",new Document("revokedAt",null)));
        db.getCollection("users").updateOne(new Document("_id",USER),new Document("$set",new Document("deletionRequestedAt",new Date())));
        call(post(PATH).header("Idempotency-Key","b1-deleting-session-key").content(request),401); assertEquals(0,db.getCollection("career_records").countDocuments());
    }
    @Test void titleAndFormulaDependenciesProduceAtomicComputationEvents() throws Exception {
        db.getCollection("career_categories").updateOne(new Document("_id",CATEGORY),new Document("$push",new Document("propertySchemaV2",new Document("$each",List.of(def(id(75),"title","title",new Document()),def(id(76),"formula","formula",new Document()))))));
        var rid=create(CATEGORY,"computed-create").get("id").asText();
        assertEquals(1,db.getCollection("outbox_events").countDocuments());
        call(patch(PATH+"/"+rid).header("If-Match","\"v1\"").content("{\"title\":\"new title\"}"),200);
        var event=db.getCollection("outbox_events").find(new Document("payload.sourceRecordVersion",2L)).first();
        assertNotNull(event); assertEquals(List.of(id(75),id(76)),event.get("payload",Document.class).getList("changedPropertyIds",String.class));
    }
    @Test void failedCreateLeavesNeitherRecordNorReplayAndCanBeRetried() throws Exception {
        var input="{\"categoryId\":\""+CATEGORY+"\",\"title\":\"retry\",\"propertyValues\":"+fixture().get("data").get("propertyValues")+"}";
        rejectOutbox();
        try {
            call(post(PATH).header("Idempotency-Key","b1-failed-create-key").content(input),500);
            assertEquals(0,db.getCollection("career_records").countDocuments()); assertEquals(0,db.getCollection("career_command_idempotency").countDocuments()); assertEquals(0,db.getCollection("outbox_events").countDocuments());
        } finally {restoreOutbox();}
        call(post(PATH).header("Idempotency-Key","b1-failed-create-key").content(input),201); assertEquals(1,db.getCollection("career_records").countDocuments());
    }
    @Test void failedRelationOutboxRollsBackEdgesVersionAndReferenceGuards() throws Exception {
        var source=create(CATEGORY,"rollback-source").get("id").asText(); var target=create(TARGET,"rollback-target").get("id").asText();
        var input="{\"propertyId\":\""+REL+"\",\"targetIds\":[\""+target+"\"]}";
        var beforeSource=stored(source); var beforeTarget=stored(target); rejectOutbox();
        try {
            call(put(PATH+"/"+source+"/relations").header("If-Match","\"v1\"").content(input),500);
            assertEquals(beforeSource,stored(source)); assertEquals(beforeTarget,stored(target)); assertEquals(0,db.getCollection("career_record_relations").countDocuments());
        } finally {restoreOutbox();}
    }
    @Test void canonicalMissingIsNotAssumedToBeEmpty() throws Exception {
        var rid=create(CATEGORY,"missing").get("id").asText();
        db.getCollection("career_records").updateOne(new Document("_id",rid),new Document("$unset",new Document("propertyValues","")));
        call(patch(PATH+"/"+rid).header("If-Match","\"v1\"").content("{\"title\":\"unknown values\"}"),409);
        assertFalse(stored(rid).containsKey("propertyValues"));
    }
    @Test void relationCanRemoveAnAlreadyTrashedTargetWithoutRevivingIt() throws Exception {
        var source=create(CATEGORY,"trashed-source").get("id").asText(); var target=create(TARGET,"trashed-target").get("id").asText();
        call(put(PATH+"/"+source+"/relations").header("If-Match","\"v1\"").content("{\"propertyId\":\""+REL+"\",\"targetIds\":[\""+target+"\"]}"),200);
        call(delete(PATH+"/"+target).header("If-Match","\"v1\""),200); var trashed=stored(target);
        call(put(PATH+"/"+source+"/relations").header("If-Match","\"v2\"").content("{\"propertyId\":\""+REL+"\",\"targetIds\":[]}"),200);
        assertEquals(trashed,stored(target)); assertEquals(0,db.getCollection("career_record_relations").countDocuments());
    }
    @Test void mongoCasPredicateRejectsAnOldSnapshotEvenWithoutRereading() throws Exception {
        var rid=create(CATEGORY,"predicate").get("id").asText(); var actor=new CareerCommandRepository.Actor(USER,CareerMoveTokens.hash(TOKEN));
        var before=repository.transaction(actor,tx -> tx.record(rid,false));
        call(patch(PATH+"/"+rid).header("If-Match","\"v1\"").content("{\"title\":\"winner\"}"),200);
        var after=before.business().apply(com.expresso.backend.career.domain.CareerRecordChangeSet.none().withTitle("loser"),Instant.now());
        var failure=assertThrows(CareerCommandException.class,() -> repository.transaction(actor,tx -> {tx.save(before,after,null,null,before.unmapped(),false);return after;}));
        assertEquals(412,failure.status()); assertEquals("winner",stored(rid).getString("title")); assertEquals(2L,stored(rid).getLong("version"));
    }
    @Test void transactionRechecksSessionAfterAuthentication() throws Exception {
        var actor=repository.authenticate(TOKEN);
        db.getCollection("identity_sessions").updateOne(new Document("userId",USER),new Document("$set",new Document("revokedAt",new Date())));
        var failure=assertThrows(CareerCommandException.class,() -> repository.transaction(actor,tx -> {tx.insert(CareerRecord.create(id(100),USER,CATEGORY,Instant.now()));return null;}));
        assertEquals(401,failure.status()); assertEquals(0,db.getCollection("career_records").countDocuments());
    }
    @Test void movePreservesValidValuesThatCannotFitTheTargetRepresentation() throws Exception {
        var rid=create(CATEGORY,"long-move").get("id").asText(); protectDocument(rid);
        var text="x".repeat(2001);
        var values="[{\"propertyDefinitionId\":\""+id(11)+"\",\"type\":\"text\",\"value\":\""+text+"\"}]";
        call(patch(PATH+"/"+rid).header("If-Match","\"v1\"").content(delta(values,List.of())),200);
        db.getCollection("career_categories").updateOne(new Document("_id",TARGET),new Document("$push",new Document("propertySchemaV2",def(id(77),"p0","url",new Document()))));
        var preview=call(post(PATH+"/"+rid+"/move/preview").header("If-Match","\"v2\"").content("{\"targetCategoryId\":\""+TARGET+"\"}"),200).get("data");
        assertEquals("unmapped",preview.get("conversions").get(0).get("kind").asText());
        call(post(PATH+"/"+rid+"/move").header("If-Match","\"v2\"").content("{\"targetCategoryId\":\""+TARGET+"\",\"previewToken\":\""+preview.get("previewToken").asText()+"\"}"),200);
        assertEquals(text,stored(rid).get("unmappedProperties",Document.class).get(id(11),Document.class).get("propertyValue",Document.class).getString("value")); assertDocument(rid);
    }
    @Test void legacyDefinitionsAreReadLiveWithoutPublishingAFrozenV2Copy() throws Exception {
        var legacy=new Document("memo",new Document("id",id(11)).append("label","Memo").append("type","text").append("required",false).append("system",false));
        db.getCollection("career_categories").updateOne(new Document("_id",CATEGORY),new Document("$set",new Document("propertySchema",legacy)).append("$unset",new Document("propertySchemaV2","").append("schemaVersion","")));
        var rid=create(CATEGORY,"live-schema").get("id").asText();
        var input=delta("["+textValue(id(11),"live")+"]",List.of());
        call(patch(PATH+"/"+rid).header("If-Match","\"v1\"").content(input),200);
        db.getCollection("career_categories").updateOne(new Document("_id",CATEGORY),new Document("$set",new Document("propertySchema",new Document())).append("$inc",new Document("version",1L)));
        call(patch(PATH+"/"+rid).header("If-Match","\"v2\"").content(input),400);
        call(patch(PATH+"/"+rid).header("If-Match","\"v2\"").content(delta("[]",List.of(id(11)))),200);
        assertFalse(db.getCollection("career_categories").find(new Document("_id",CATEGORY)).first().containsKey("propertySchemaV2"));
    }
    @Test void v2IsoDeletedDefinitionsStayInactiveForCreatePatchAndMove() throws Exception {
        var definitions=db.getCollection("career_categories").find(new Document("_id",CATEGORY)).first().getList("propertySchemaV2",Document.class);
        definitions.getFirst().put("deletedAt","2026-10-01T09:00:00+09:00");
        db.getCollection("career_categories").updateOne(new Document("_id",CATEGORY),new Document("$set",new Document("propertySchemaV2",definitions)));
        var actor=repository.authenticate(TOKEN);
        var category=repository.transaction(actor,tx -> tx.category(CATEGORY));
        assertEquals(Instant.parse("2026-10-01T00:00:00Z"),category.business().propertyDefinitions().getFirst().deletedAt());
        assertNull(category.business().propertyDefinitions().get(1).deletedAt());
        var rid=create(CATEGORY,"deleted-v2").get("id").asText(); protectDocument(rid);
        var deletedValue="[{\"propertyDefinitionId\":\""+id(11)+"\",\"type\":\"text\",\"value\":\"deleted\"}]";
        call(post(PATH).header("Idempotency-Key","b1-deleted-v2-copy").content("{\"categoryId\":\""+CATEGORY+"\",\"title\":\"copy\",\"propertyValues\":"+deletedValue+"}"),400);
        call(patch(PATH+"/"+rid).header("If-Match","\"v1\"").content(delta(deletedValue,List.of())),400);
        var activeValue="[{\"propertyDefinitionId\":\""+id(12)+"\",\"type\":\"number\",\"value\":\"12.500\"}]";
        call(patch(PATH+"/"+rid).header("If-Match","\"v1\"").content(delta(activeValue,List.of())),200);
        var targetDefinition=def(id(78),"p1","number",new Document()).append("deletedAt","2026-10-01T00:00:00Z");
        db.getCollection("career_categories").updateOne(new Document("_id",TARGET),new Document("$push",new Document("propertySchemaV2",targetDefinition)));
        var input="{\"targetCategoryId\":\""+TARGET+"\"}";
        var preview=call(post(PATH+"/"+rid+"/move/preview").header("If-Match","\"v2\"").content(input),200).get("data");
        assertEquals("unmapped",preview.get("conversions").get(0).get("kind").asText());
        var moved=call(post(PATH+"/"+rid+"/move").header("If-Match","\"v2\"").content("{\"targetCategoryId\":\""+TARGET+"\",\"previewToken\":\""+preview.get("previewToken").asText()+"\"}"),200).get("data");
        assertEquals(0,moved.get("propertyValues").size());
        assertTrue(stored(rid).get("unmappedProperties",Document.class).containsKey(id(12))); assertDocument(rid);
    }
    @Test void malformedV2DeletedAtIsAStorageFailureAndNeverActive() throws Exception {
        var definitions=db.getCollection("career_categories").find(new Document("_id",CATEGORY)).first().getList("propertySchemaV2",Document.class);
        definitions.getFirst().put("deletedAt","not-an-instant");
        db.getCollection("career_categories").updateOne(new Document("_id",CATEGORY),new Document("$set",new Document("propertySchemaV2",definitions)));
        var actor=repository.authenticate(TOKEN);
        var error=assertThrows(IllegalStateException.class,() -> repository.transaction(actor,tx -> tx.category(CATEGORY)));
        assertTrue(error.getMessage().contains("deletedAt"));
        var response=call(post(PATH).header("Idempotency-Key","b1-malformed-v2-key").content("{\"categoryId\":\""+CATEGORY+"\"}"),500);
        assertEquals("INTERNAL_ERROR",response.get("error").get("code").asText());
        assertEquals(0,db.getCollection("career_records").countDocuments());
    }
    static String textValue(String property,String value) {return "{\"propertyDefinitionId\":\""+property+"\",\"type\":\"text\",\"value\":\""+value+"\"}";}
    static String delta(String set,List<String> unset) {return "{\"propertyValues\":{\"set\":"+set+",\"unsetPropertyIds\":"+JSON.writeValueAsString(unset)+"}}";}
    String twoValueRecord(String suffix) throws Exception {
        db.getCollection("career_categories").updateOne(new Document("_id",CATEGORY),new Document("$push",new Document("propertySchemaV2",def(id(79),"extra","text",new Document()))));
        var input="{\"categoryId\":\""+CATEGORY+"\",\"title\":\"\",\"propertyValues\":["+textValue(id(11),"A")+","+textValue(id(79),"B")+"]}";
        var rid=call(post(PATH).header("Idempotency-Key","b1-two-values-"+suffix).content(input),201).get("data").get("id").asText();
        protectDocument(rid); db.getCollection("outbox_events").deleteMany(new Document()); return rid;
    }
    @Test void partialPropertyPatchPreservesOmittedValuesAndEmitsOnlyChangedIds() throws Exception {
        var rid=twoValueRecord("preserve");
        db.getCollection("career_categories").updateOne(new Document("_id",CATEGORY),new Document("$push",new Document("propertySchemaV2",def(id(76),"formula","formula",new Document()))));
        var changed=call(patch(PATH+"/"+rid).header("If-Match","\"v1\"").content(delta("["+textValue(id(11),"A2")+"]",List.of())),200).get("data");
        assertEquals(2,changed.get("version").asLong());
        assertEquals(JSON.readTree("["+textValue(id(11),"A2")+","+textValue(id(79),"B")+"]"),changed.get("propertyValues"));
        var event=db.getCollection("outbox_events").find().first();
        assertEquals(List.of(id(11)),event.get("payload",Document.class).getList("changedPropertyIds",String.class));
        var before=stored(rid);
        call(patch(PATH+"/"+rid).header("If-Match","\"v2\"").content(delta("[]",List.of())),200);
        call(patch(PATH+"/"+rid).header("If-Match","\"v2\"").content(delta("["+textValue(id(79),"B")+","+textValue(id(11),"A2")+"]",List.of())),200);
        call(patch(PATH+"/"+rid).header("If-Match","\"v2\"").content(delta("[]",List.of(id(99)))),200);
        assertEquals(before,stored(rid)); assertEquals(1,db.getCollection("outbox_events").countDocuments());
        call(patch(PATH+"/"+rid).header("If-Match","\"v1\"").content(delta("[]",List.of(id(79)))),412);
        call(patch(PATH+"/"+rid).header("If-Match","\"v2\"").content(delta("["+textValue(id(99),"unknown")+"]",List.of())),400);
        call(patch(PATH+"/"+rid).header("If-Match","\"v2\"").content(delta("["+textValue(id(11),"bad")+"]",List.of(id(11)))),400);
        assertEquals(before,stored(rid)); assertDocument(rid);
        db.getCollection("career_records").updateOne(new Document("_id",rid),new Document("$set",new Document("version",CareerRecord.MAX_VERSION)));
        call(patch(PATH+"/"+rid).header("If-Match","\"v"+CareerRecord.MAX_VERSION+"\"").content(delta("[]",List.of(id(99)))),200);
        call(patch(PATH+"/"+rid).header("If-Match","\"v"+CareerRecord.MAX_VERSION+"\"").content(delta("[]",List.of(id(79)))),409);
        assertEquals(CareerRecord.MAX_VERSION,stored(rid).getLong("version")); assertDocument(rid);
    }
    @Test void explicitPropertyUnsetAndCombinedDeltaAreAtomic() throws Exception {
        var rid=twoValueRecord("unset");
        var response=call(patch(PATH+"/"+rid).header("If-Match","\"v1\"").content(delta("[]",List.of(id(79)))),200).get("data");
        assertEquals(JSON.readTree("["+textValue(id(11),"A")+"]"),response.get("propertyValues")); assertEquals(2,response.get("version").asLong());
        assertEquals(List.of(id(79)),db.getCollection("outbox_events").find().first().get("payload",Document.class).getList("changedPropertyIds",String.class));
        call(patch(PATH+"/"+rid).header("If-Match","\"v2\"").content(delta("[]",List.of(id(79)))),200);
        call(patch(PATH+"/"+rid).header("If-Match","\"v2\"").content(delta("["+textValue(id(79),"B")+"]",List.of())),200);
        var before=stored(rid); var outboxCount=db.getCollection("outbox_events").countDocuments(); rejectOutbox();
        try {
            call(patch(PATH+"/"+rid).header("If-Match","\"v3\"").content(delta("["+textValue(id(11),"A3")+"]",List.of(id(79)))),500);
            assertEquals(before,stored(rid)); assertEquals(outboxCount,db.getCollection("outbox_events").countDocuments());
        } finally {restoreOutbox();}
        var combined=call(patch(PATH+"/"+rid).header("If-Match","\"v3\"").content(delta("["+textValue(id(11),"A3")+"]",List.of(id(79)))),200).get("data");
        assertEquals(JSON.readTree("["+textValue(id(11),"A3")+"]"),combined.get("propertyValues")); assertEquals(4,combined.get("version").asLong());
        var event=db.getCollection("outbox_events").find(new Document("payload.sourceRecordVersion",4L)).first();
        assertEquals(List.of(id(11),id(79)),event.get("payload",Document.class).getList("changedPropertyIds",String.class)); assertDocument(rid);
    }
    @Test void nullableValueSetIsDistinctFromExplicitUnset() throws Exception {
        var rid=twoValueRecord("null-value");
        var nullable="[{\"propertyDefinitionId\":\""+id(14)+"\",\"type\":\"select\",\"value\":null}]";
        var set=call(patch(PATH+"/"+rid).header("If-Match","\"v1\"").content(delta(nullable,List.of())),200).get("data");
        assertEquals(3,set.get("propertyValues").size()); assertTrue(set.get("propertyValues").get(2).get("value").isNull());
        assertTrue(stored(rid).getList("propertyValues",Document.class).get(2).containsKey("value"));
        assertNull(stored(rid).getList("propertyValues",Document.class).get(2).get("value"));
        var unset=call(patch(PATH+"/"+rid).header("If-Match","\"v2\"").content(delta("[]",List.of(id(14)))),200).get("data");
        assertEquals(2,unset.get("propertyValues").size()); assertEquals(3,unset.get("version").asLong()); assertDocument(rid);
    }
    void rejectOutbox() {db.runCommand(new Document("collMod","outbox_events").append("validator",new Document("$expr",new Document("$eq",List.of(1,0)))));}
    void restoreOutbox() throws Exception {
        var schema=JSON.readTree(Files.readString(Path.of(System.getProperty("b1RepositoryRoot"),"packages/database/src/mongodb-migrations/0001/schema.json")));
        for(var collection:schema) if(collection.get("name").asText().equals("outbox_events")) db.runCommand(new Document("collMod","outbox_events").append("validator",Document.parse(collection.get("validator").toString())));
    }

    String moveDiscardFixture(String suffix) throws Exception {
        var rid=create(CATEGORY,suffix).get("id").asText();protectDocument(rid);
        call(patch(PATH+"/"+rid).header("If-Match","\"v1\"").content(delta(fixture().get("data").get("propertyValues").toString(),List.of())),200);
        var target=db.getCollection("career_categories").find(new Document("_id",TARGET)).first();
        var definitions=new ArrayList<>(target.getList("propertySchemaV2",Document.class));definitions.add(def(id(95),"p0","text",new Document()));
        db.getCollection("career_categories").updateOne(new Document("_id",TARGET),new Document("$set",new Document("propertySchemaV2",definitions)));
        var provenance=new Document("sourcePropertyKey","older").append("sourcePropertyName","Older").append("sourcePropertyDefinitionVersion",1L).append("preservedAt","2026-09-01T00:00:00Z").append("sourceRecordVersion",1L).append("reason","no_target_property");
        var previous=new Document("sourceCategoryId",CATEGORY).append("propertyValue",new Document("propertyDefinitionId",id(97)).append("type","number").append("value",new Decimal128(new java.math.BigDecimal("7.1200")))).append("provenance",provenance);
        db.getCollection("career_records").updateOne(new Document("_id",rid),new Document("$set",new Document("unmappedProperties",new Document(id(97),previous))));
        db.getCollection("outbox_events").deleteMany(new Document());
        return rid;
    }
    JsonNode discardPreview(String rid) throws Exception {
        return call(post(PATH+"/"+rid+"/move/preview").header("If-Match","\"v2\"").content(new Document("targetCategoryId",TARGET).toJson()),200).get("data");
    }
    static String discardMove(JsonNode preview,List<String> ids) {
        var input=new Document("targetCategoryId",TARGET).append("previewToken",preview.get("previewToken").asText());
        if(ids!=null)input.append("discardUnmappedPropertyIds",ids);return input.toJson();
    }
    @Test void moveDiscardsOnlySelectedUnmappedIdsAndPreservesMappedDecimalDateAndExistingEnvelope() throws Exception {
        var rid=moveDiscardFixture("discard-selected");var previous=stored(rid).get("unmappedProperties",Document.class).get(id(97));var preview=discardPreview(rid);
        assertFalse(preview.get("unmappedPropertyIds").toString().contains(id(11)));assertTrue(preview.get("unmappedPropertyIds").toString().contains(id(13)));
        var moved=call(post(PATH+"/"+rid+"/move").header("If-Match","\"v2\"").content(discardMove(preview,List.of(id(13),id(13)))),200).get("data");
        assertEquals(3,moved.get("version").asLong());assertEquals(TARGET,moved.get("categoryId").asText());assertEquals(1,moved.get("propertyValues").size());
        assertEquals(id(95),moved.get("propertyValues").get(0).get("propertyDefinitionId").asText());assertEquals(fixture().get("data").get("propertyValues").get(0).get("value"),moved.get("propertyValues").get(0).get("value"));
        var unmapped=stored(rid).get("unmappedProperties",Document.class);assertFalse(unmapped.containsKey(id(13)));assertFalse(unmapped.containsKey(id(11)));assertEquals(previous,unmapped.get(id(97)));
        assertEquals(new Decimal128(new java.math.BigDecimal("12345678901234567890.123400")),unmapped.get(id(12),Document.class).get("propertyValue",Document.class).get("value"));
        var date=fixture().get("data").get("propertyValues");for(var value:date)if(value.get("type").asText().equals("date"))assertEquals(value.get("value"),JSON.valueToTree(unmapped.get(value.get("propertyDefinitionId").asText(),Document.class).get("propertyValue",Document.class).get("value")));
        assertEquals(1,db.getCollection("outbox_events").countDocuments());assertDocument(rid);
    }
    @Test void moveMayExplicitlyDiscardPreviouslyUnmappedEntries() throws Exception {
        var rid=moveDiscardFixture("discard-previous");var preview=discardPreview(rid);
        call(post(PATH+"/"+rid+"/move").header("If-Match","\"v2\"").content(discardMove(preview,List.of(id(97)))),200);
        var unmapped=stored(rid).get("unmappedProperties",Document.class);assertFalse(unmapped.containsKey(id(97)));assertTrue(unmapped.containsKey(id(13)));assertEquals(1,db.getCollection("outbox_events").countDocuments());assertDocument(rid);
    }
    @Test void moveRejectsUnknownAndMappedDiscardIdsWithoutAnyBusinessOrOutboxChange() throws Exception {
        var rid=moveDiscardFixture("discard-invalid");var preview=discardPreview(rid);var before=stored(rid);
        for(var property:List.of(id(99),id(11),id(95)))call(post(PATH+"/"+rid+"/move").header("If-Match","\"v2\"").content(discardMove(preview,List.of(property))),400);
        assertEquals(before,stored(rid));assertEquals(0,db.getCollection("outbox_events").countDocuments());assertDocument(rid);
    }
    @Test void discardMoveRejectsChangedPreviewAndStaleRecordVersion() throws Exception {
        var rid=moveDiscardFixture("discard-stale");var preview=discardPreview(rid);var before=stored(rid);
        db.getCollection("career_categories").updateOne(new Document("_id",TARGET),new Document("$inc",new Document("schemaVersion",1L)));
        call(post(PATH+"/"+rid+"/move").header("If-Match","\"v2\"").content(discardMove(preview,List.of(id(13)))),409);assertEquals(before,stored(rid));assertEquals(0,db.getCollection("outbox_events").countDocuments());
        var fresh=discardPreview(rid);call(patch(PATH+"/"+rid).header("If-Match","\"v2\"").content("{\"title\":\"later\"}"),200);var updated=stored(rid);
        call(post(PATH+"/"+rid+"/move").header("If-Match","\"v2\"").content(discardMove(fresh,List.of(id(13)))),412);
        call(post(PATH+"/"+rid+"/move").header("If-Match","\"v3\"").content(discardMove(fresh,List.of(id(13)))),409);assertEquals(updated,stored(rid));assertEquals(CATEGORY,stored(rid).getString("categoryId"));assertDocument(rid);
    }
    @Test void failedOutboxRollsBackDiscardAndCategoryMoveTogether() throws Exception {
        var rid=moveDiscardFixture("discard-rollback");var preview=discardPreview(rid);var before=stored(rid);
        var validator=db.listCollections().filter(new Document("name","outbox_events")).first().get("options",Document.class).get("validator",Document.class);
        db.runCommand(new Document("collMod","outbox_events").append("validator",new Document("$expr",new Document("$eq",List.of(1,0)))));
        try {call(post(PATH+"/"+rid+"/move").header("If-Match","\"v2\"").content(discardMove(preview,List.of(id(13),id(97)))),500);assertEquals(before,stored(rid));assertEquals(0,db.getCollection("outbox_events").countDocuments());}
        finally {db.runCommand(new Document("collMod","outbox_events").append("validator",validator));}
        assertDocument(rid);
    }

    static Document mutationLockJob(String user,String category,String record,String status) {
        var target=def(id(11),"p0","text",new Document());var operation=new Document("kind","conversion").append("source",target).append("target",target).append("defaultValue",null).append("confirmLossy",false);
        var plan=new Document("userId",user).append("categoryId",category).append("categoryVersion",1).append("schemaVersion",1).append("definitions",List.of(target)).append("recordIds",List.of(record)).append("operation",operation);
        var planJson=JSON.writeValueAsString(plan);var now=new Date();
        return new Document("_id",id(300)).append("userId",user).append("categoryId",category).append("propertyId",id(11)).append("planJson",planJson).append("operationFingerprint",CareerMoveTokens.hash(planJson)).append("status",status).append("active",true).append("cursor",0).append("processedCount",0).append("skippedCount",0).append("attempts",0).append("leaseToken",null).append("leaseUntil",null).append("lastError",null).append("commitFence",0L).append("createdAt",now).append("updatedAt",now).append("completedAt",null);
    }
    @Test void activeMutationBlocksWritesIncludingNoopsWithOnlyOwnedJobMetadata() throws Exception {
        var rid=create(CATEGORY,"lock-active").get("id").asText();protectDocument(rid);var before=stored(rid);
        db.getCollection("career_property_mutations").insertOne(mutationLockJob(USER,CATEGORY,rid,"pending"));
        for(var title:List.of("","blocked")) {
            var error=call(patch(PATH+"/"+rid).header("If-Match","\"v1\"").content(new Document("title",title).toJson()),409).get("error");
            assertEquals("CONFLICT",error.get("code").asText());assertEquals("CAREER_PROPERTY_MUTATION_ACTIVE",error.get("message").asText());assertEquals(id(300),error.get("details").get("mutationId").asText());assertEquals("pending",error.get("details").get("status").asText());assertFalse(error.get("details").get("retryable").asBoolean());assertEquals(3,error.get("details").size());assertFalse(error.toString().contains(USER));assertFalse(error.toString().contains(OTHER));
        }
        call(post(PATH).header("Idempotency-Key","lock-active-create-key").content(new Document("categoryId",CATEGORY).toJson()),409);
        call(delete(PATH+"/"+rid).header("If-Match","\"v1\""),409);
        call(put(PATH+"/"+rid+"/relations").header("If-Match","\"v1\"").content(new Document("propertyId",REL).append("targetIds",List.of()).toJson()),409);
        call(post(PATH+"/"+rid+"/move/preview").header("If-Match","\"v1\"").content(new Document("targetCategoryId",TARGET).toJson()),200);
        assertEquals(before,stored(rid));assertEquals(1,db.getCollection("career_records").countDocuments());assertEquals(0,db.getCollection("outbox_events").countDocuments());assertDocument(rid);
    }
    @Test void failedAndResumedMutationStayLockedUntilCompletion() throws Exception {
        var rid=create(CATEGORY,"lock-status").get("id").asText();db.getCollection("career_property_mutations").insertOne(mutationLockJob(USER,CATEGORY,rid,"failed"));
        var failed=call(patch(PATH+"/"+rid).header("If-Match","\"v1\"").content("{\"title\":\"blocked\"}"),409).get("error").get("details");assertEquals("failed",failed.get("status").asText());assertTrue(failed.get("retryable").asBoolean());
        db.getCollection("career_property_mutations").updateOne(new Document(),new Document("$set",new Document("status","running")));
        var resumed=call(patch(PATH+"/"+rid).header("If-Match","\"v1\"").content("{\"title\":\"blocked\"}"),409).get("error").get("details");assertEquals("running",resumed.get("status").asText());assertFalse(resumed.get("retryable").asBoolean());
        db.getCollection("career_property_mutations").updateOne(new Document(),new Document("$set",new Document("status","completed").append("active",false).append("completedAt",new Date())));
        assertEquals(2,call(patch(PATH+"/"+rid).header("If-Match","\"v1\"").content("{\"title\":\"unlocked\"}"),200).get("data").get("version").asLong());
    }
    @Test void foreignMutationAndSharedSystemCategoryCannotGloballyBlockOwnedRecords() throws Exception {
        var rid=create(CATEGORY,"lock-foreign").get("id").asText();db.getCollection("career_property_mutations").insertOne(mutationLockJob(OTHER,CATEGORY,rid,"pending"));
        call(patch(PATH+"/"+rid).header("If-Match","\"v1\"").content("{\"title\":\"owned\"}"),200);
        db.getCollection("career_property_mutations").deleteMany(new Document());
        db.getCollection("career_categories").updateOne(new Document("_id",CATEGORY),new Document("$set",new Document("userId",null).append("isSystem",true)));
        db.getCollection("career_property_mutations").insertOne(mutationLockJob(USER,CATEGORY,rid,"pending"));
        call(patch(PATH+"/"+rid).header("If-Match","\"v2\"").content("{\"title\":\"shared\"}"),200);
        var other=mvc.perform(post(PATH).header("Authorization","Bearer "+TOKEN2).header("Idempotency-Key","shared-other-create-key").contentType("application/json").content(new Document("categoryId",CATEGORY).toJson())).andReturn().getResponse();assertEquals(201,other.getStatus(),other.getContentAsString());
    }
    @Test void committedCreateReceiptStillReplaysWhileAnUnrelatedMutationIsActive() throws Exception {
        var first=create(CATEGORY,"lock-replay");db.getCollection("career_property_mutations").insertOne(mutationLockJob(USER,CATEGORY,first.get("id").asText(),"pending"));
        assertEquals(first,create(CATEGORY,"lock-replay"));assertEquals(1,db.getCollection("career_records").countDocuments());assertEquals(1,db.getCollection("career_command_idempotency").countDocuments());
    }
    @Test void categoryFenceRejectsLifecycleWriteWhenSchemaJobCommitsAfterBusinessSnapshot() throws Exception {
        var rid=create(CATEGORY,"lock-race").get("id").asText();var before=stored(rid);var swapped=new java.util.concurrent.atomic.AtomicBoolean();
        CareerCommandRepository intercepted=new CareerCommandRepository() {
            @Override public <T> T transaction(Actor actor,java.util.function.Function<Operations,T> work) {
                return repository.transaction(actor,operations->work.apply((Operations)java.lang.reflect.Proxy.newProxyInstance(Operations.class.getClassLoader(),new Class<?>[]{Operations.class},(proxy,method,args)->{
                    if(method.getName().equals("save")&&swapped.compareAndSet(false,true))try(var schema=client.startSession()) {
                        schema.withTransaction(()->{db.getCollection("career_categories").updateOne(schema,new Document("_id",CATEGORY),new Document("$inc",new Document("version",1L).append("schemaVersion",1L)));db.getCollection("career_property_mutations").insertOne(schema,mutationLockJob(USER,CATEGORY,rid,"pending"));return null;});
                    }
                    try{return method.invoke(operations,args);}catch(java.lang.reflect.InvocationTargetException error){throw error.getCause();}
                })));
            }
        };
        var service=new CareerCommandService(intercepted,Clock.systemUTC(),new CareerMoveTokens("disposable-test-secret-with-at-least-32-bytes"));
        var error=assertThrows(CareerCommandException.class,()->service.trash(repository.authenticate(TOKEN),rid,1));
        assertEquals("CAREER_PROPERTY_MUTATION_ACTIVE",error.code());assertTrue(swapped.get());assertEquals(before,stored(rid));assertEquals(0,db.getCollection("outbox_events").countDocuments());assertEquals(1,db.getCollection("career_property_mutations").countDocuments());
    }

    @Test void activeMutationBlocksRestoreAndCompletionUnlocksBothLifecycleDirections() throws Exception {
        var rid=create(CATEGORY,"lock-restore").get("id").asText();var other=create(CATEGORY,"lock-restore-active").get("id").asText();protectDocument(rid);
        call(delete(PATH+"/"+rid).header("If-Match","\"v1\""),200);var before=stored(rid);var outbox=db.getCollection("outbox_events").countDocuments();
        db.getCollection("career_property_mutations").insertOne(mutationLockJob(USER,CATEGORY,other,"pending"));
        call(post(PATH+"/"+rid+"/restore").header("If-Match","\"v2\""),409);call(delete(PATH+"/"+other).header("If-Match","\"v1\""),409);
        assertEquals(before,stored(rid));assertEquals(1L,stored(other).getLong("version"));assertEquals(outbox,db.getCollection("outbox_events").countDocuments());
        db.getCollection("career_property_mutations").updateOne(new Document(),new Document("$set",new Document("status","completed").append("active",false).append("cursor",1).append("processedCount",1).append("completedAt",new Date())));
        call(post(PATH+"/"+rid+"/restore").header("If-Match","\"v2\""),200);call(delete(PATH+"/"+other).header("If-Match","\"v1\""),200);assertNull(stored(rid).get("deletedAt"));assertEquals(3L,stored(rid).getLong("version"));assertNotNull(stored(other).get("deletedAt"));assertDocument(rid);
    }
    static Document privateOption(String user,String category,String property,String option,String label) {
        return new Document("_id",UUID.randomUUID().toString()).append("userId",user).append("categoryId",category).append("propertyId",property).append("optionId",option).append("rawLabel",label).append("version",1L).append("createdAt",new Date());
    }
    void privateOptionsCategory() {
        var definition=def(id(15),"tags","multi_select",new Document("legacyFreeformTags",true).append("options",List.of(new Document("id",id(81)).append("label","A").append("color","blue"))));
        db.getCollection("career_categories").updateOne(new Document("_id",CATEGORY),new Document("$set",new Document("userId",null).append("isSystem",true).append("propertySchemaV2",List.of(definition))));
        db.getCollection("career_property_options").insertMany(List.of(privateOption(USER,CATEGORY,id(15),id(401)," A "),privateOption(USER,CATEGORY,id(15),id(402),"a"),privateOption(OTHER,CATEGORY,id(15),id(403),"foreign"),privateOption(USER,CATEGORY,id(16),id(404),"wrong property")));
    }
    static String multiValue(String property,List<String> ids) {
        return new Document("propertyDefinitionId",property).append("type","multi_select").append("value",ids).toJson();
    }
    @Test void privateOptionsFollowAuthenticatedRecordOwnerAndNeverPublishIntoSharedSchema() throws Exception {
        privateOptionsCategory();var schema=db.getCollection("career_categories").find(new Document("_id",CATEGORY)).first().get("propertySchemaV2");
        var values="["+multiValue(id(15),List.of(id(81),id(401),id(402)))+"]";
        var created=call(post(PATH).header("Idempotency-Key","private-options-user-a-key").content("{\"categoryId\":\""+CATEGORY+"\",\"title\":\"\",\"propertyValues\":"+values+"}"),201).get("data");var rid=created.get("id").asText();
        var before=stored(rid);var outbox=db.getCollection("outbox_events").countDocuments();var receipts=db.getCollection("career_command_idempotency").countDocuments();
        for(var option:List.of(id(403),id(404)))call(patch(PATH+"/"+rid).header("If-Match","\"v1\"").content(delta("["+multiValue(id(15),List.of(option))+"]",List.of())),400);
        call(patch(PATH+"/"+rid).header("If-Match","\"v1\"").content("{\"userId\":\""+OTHER+"\",\"title\":\"spoof\"}"),400);
        assertEquals(before,stored(rid));assertEquals(outbox,db.getCollection("outbox_events").countDocuments());assertEquals(receipts,db.getCollection("career_command_idempotency").countDocuments());
        var body="{\"categoryId\":\""+CATEGORY+"\",\"propertyValues\":["+multiValue(id(15),List.of(id(403)))+"]}";
        var own=mvc.perform(post(PATH).header("Authorization","Bearer "+TOKEN2).header("Idempotency-Key","private-options-user-b-key").contentType("application/json").content(body)).andReturn().getResponse();assertEquals(201,own.getStatus(),own.getContentAsString());
        var otherId=JSON.readTree(own.getContentAsString()).get("data").get("id").asText();
        var foreign=mvc.perform(patch(PATH+"/"+otherId).header("Authorization","Bearer "+TOKEN2).header("If-Match","\"v1\"").contentType("application/json").content(delta("["+multiValue(id(15),List.of(id(401)))+"]",List.of()))).andReturn().getResponse();assertEquals(400,foreign.getStatus(),foreign.getContentAsString());
        assertEquals(schema,db.getCollection("career_categories").find(new Document("_id",CATEGORY)).first().get("propertySchemaV2"));assertEquals(4,db.getCollection("career_property_options").countDocuments());
    }
    @Test void privateOptionOverlayPreservesExactLabelsCommonIdsAndMetadata() {
        privateOptionsCategory();db.getCollection("career_property_options").insertOne(privateOption(USER,CATEGORY,id(15),id(81),"A"));
        var category=repository.transaction(repository.authenticate(TOKEN),tx->tx.category(CATEGORY));
        var options=(List<?>)category.business().propertyDefinitions().getFirst().config().get("options");assertEquals(3,options.size());
        var first=(Map<?,?>)options.getFirst();assertEquals(id(81),first.get("id"));assertEquals("A",first.get("name"));assertEquals("blue",first.get("color"));
        assertEquals(Set.of("A"," A ","a"),options.stream().map(value->((Map<?,?>)value).get("name")).collect(java.util.stream.Collectors.toSet()));
    }
    @Test void privateOptionUuidAndExactLabelCollisionsFailWithoutBusinessWrites() throws Exception {
        for(var collision:List.of(privateOption(USER,CATEGORY,id(15),id(81),"different"),privateOption(USER,CATEGORY,id(15),id(405),"A"))) {
            seed();privateOptionsCategory();db.getCollection("career_property_options").insertOne(collision);
            var response=call(post(PATH).header("Idempotency-Key","private-options-collision-key").content("{\"categoryId\":\""+CATEGORY+"\"}"),409);
            assertEquals("PRIVATE_OPTION_MAPPING_CONFLICT",response.get("error").get("message").asText());assertFalse(response.toString().contains(OTHER));
            assertEquals(0,db.getCollection("career_records").countDocuments());assertEquals(0,db.getCollection("career_command_idempotency").countDocuments());assertEquals(0,db.getCollection("outbox_events").countDocuments());
        }
    }
    @Test void moveMapsOwnerPrivateOptionsByExactWireLabelWithoutNormalizing() throws Exception {
        privateOptionsCategory();var target=def(id(406),"tags","multi_select",new Document("legacyFreeformTags",true).append("options",List.of()));
        db.getCollection("career_categories").updateOne(new Document("_id",TARGET),new Document("$set",new Document("propertySchemaV2",List.of(target))));
        db.getCollection("career_property_options").insertMany(List.of(privateOption(USER,TARGET,id(406),id(407)," A "),privateOption(USER,TARGET,id(406),id(408),"a"),privateOption(OTHER,TARGET,id(406),id(409),"A")));
        var created=call(post(PATH).header("Idempotency-Key","private-options-move-key").content("{\"categoryId\":\""+CATEGORY+"\",\"title\":\"\",\"propertyValues\":["+multiValue(id(15),List.of(id(401),id(402)))+"]}"),201).get("data");var rid=created.get("id").asText();
        var preview=call(post(PATH+"/"+rid+"/move/preview").header("If-Match","\"v1\"").content("{\"targetCategoryId\":\""+TARGET+"\"}"),200).get("data");
        var moved=call(post(PATH+"/"+rid+"/move").header("If-Match","\"v1\"").content("{\"targetCategoryId\":\""+TARGET+"\",\"previewToken\":\""+preview.get("previewToken").asText()+"\"}"),200).get("data");
        assertEquals(JSON.readTree("["+multiValue(id(406),List.of(id(407),id(408)))+"]"),moved.get("propertyValues"));
    }
    @Test void privateOptionMalformedWireLabelAndNullCommonOptionsFailClosed() throws Exception {
        for(var config:List.of(new Document("options",null),new Document("options",List.of(new Document("id",id(81)).append("label",null).append("name","A"))),new Document("options",List.of(new Document("id",id(81)).append("label","A").append("name","different"))))) {
            seed();privateOptionsCategory();db.getCollection("career_categories").updateOne(new Document("_id",CATEGORY),new Document("$set",new Document("propertySchemaV2.0.config",config)));
            call(post(PATH).header("Idempotency-Key","private-options-malformed-key").content("{\"categoryId\":\""+CATEGORY+"\"}"),409);
            assertEquals(0,db.getCollection("career_records").countDocuments());assertEquals(0,db.getCollection("career_command_idempotency").countDocuments());assertEquals(0,db.getCollection("outbox_events").countDocuments());
        }
    }
    @Test void combinedTitleStatusAndPropertyDeltaUsesOneCasVersionAndOutbox() throws Exception {
        var rid=create(CATEGORY,"combined-patch").get("id").asText();protectDocument(rid);var original=fixture().get("data").get("propertyValues");
        call(patch(PATH+"/"+rid).header("If-Match","\"v1\"").content(delta(original.toString(),List.of())),200);
        var number=new Document("propertyDefinitionId",id(12)).append("type","number").append("value","9.1200");
        var input=new Document("title","combined").append("status","verified").append("propertyValues",new Document("set",List.of(number)).append("unsetPropertyIds",List.of(id(13)))).toJson();
        var result=call(patch(PATH+"/"+rid).header("If-Match","\"v2\"").content(input),200).get("data");assertEquals(3,result.get("version").asLong());assertEquals("combined",result.get("title").asText());assertEquals("verified",result.get("status").asText());
        var values=result.get("propertyValues");assertEquals(original.size()-1,values.size());assertEquals(original.get(0),values.get(0));assertEquals("9.1200",values.get(1).get("value").asText());assertEquals(2,db.getCollection("outbox_events").countDocuments());
        assertEquals(3,call(patch(PATH+"/"+rid).header("If-Match","\"v3\"").content(input),200).get("data").get("version").asLong());assertEquals(2,db.getCollection("outbox_events").countDocuments());
        call(patch(PATH+"/"+rid).header("If-Match","\"v2\"").content(input),412);var before=stored(rid);
        var invalid=new Document("title","must roll back").append("status","draft").append("propertyValues",new Document("set",List.of(new Document("propertyDefinitionId",id(12)).append("type","checkbox").append("value",true))).append("unsetPropertyIds",List.of())).toJson();
        call(patch(PATH+"/"+rid).header("If-Match","\"v3\"").content(invalid),400);assertEquals(before,stored(rid));assertEquals(2,db.getCollection("outbox_events").countDocuments());assertDocument(rid);
    }
    @Test void combinedPatchOutboxFailureRollsBackTitleStatusValuesAndOneVersionTogether() throws Exception {
        var rid=create(CATEGORY,"combined-rollback").get("id").asText();protectDocument(rid);var before=stored(rid);
        var input=new Document("title","rollback").append("status","organized").append("propertyValues",new Document("set",List.of(new Document("propertyDefinitionId",id(12)).append("type","number").append("value","7.1200"))).append("unsetPropertyIds",List.of())).toJson();
        var validator=db.listCollections().filter(new Document("name","outbox_events")).first().get("options",Document.class).get("validator",Document.class);
        db.runCommand(new Document("collMod","outbox_events").append("validator",new Document("$expr",new Document("$eq",List.of(1,0)))));
        try {call(patch(PATH+"/"+rid).header("If-Match","\"v1\"").content(input),500);assertEquals(before,stored(rid));assertEquals(0,db.getCollection("outbox_events").countDocuments());}
        finally {db.runCommand(new Document("collMod","outbox_events").append("validator",validator));}
        var result=call(patch(PATH+"/"+rid).header("If-Match","\"v1\"").content(input),200).get("data");assertEquals(2,result.get("version").asLong());assertEquals("organized",result.get("status").asText());assertEquals("rollback",result.get("title").asText());assertEquals(1,db.getCollection("outbox_events").countDocuments());assertDocument(rid);
    }
    @Test void initialRelationCreateUsesOneFinalVersionAndDurableReceiptWithoutPartialDuplicate() throws Exception {
        var target=create(TARGET,"initial-target").get("id").asText();db.getCollection("outbox_events").deleteMany(new Document());var input=new Document("categoryId",CATEGORY).append("title","initial relations").append("propertyValues",List.of()).append("initialRelations",List.of(new Document("propertyId",REL).append("targetIds",List.of(target))));
        var first=call(post(PATH).header("Idempotency-Key","initial-relation-create-key").content(input.toJson()),201).get("data");var source=first.get("id").asText();assertEquals(1,first.get("version").asLong());assertEquals(2,db.getCollection("career_record_relations").countDocuments());assertEquals(2,db.getCollection("outbox_events").countDocuments());assertEquals(1L,stored(target).getLong("version"));var refs=stored(target).get("referenceVersion");
        assertEquals(source,call(post(PATH).header("Idempotency-Key","initial-relation-create-key").content(input.toJson()),201).get("data").get("id").asText());assertEquals(refs,stored(target).get("referenceVersion"));assertEquals(2,db.getCollection("outbox_events").countDocuments());
        var beforeRecords=db.getCollection("career_records").countDocuments();var beforeReceipts=db.getCollection("career_command_idempotency").countDocuments();call(post(PATH).header("Idempotency-Key","initial-relation-conflict-key").content(input.toJson()),409);assertEquals(beforeRecords,db.getCollection("career_records").countDocuments());assertEquals(beforeReceipts,db.getCollection("career_command_idempotency").countDocuments());assertEquals(2,db.getCollection("career_record_relations").countDocuments());
        input.put("initialRelations",List.of());call(post(PATH).header("Idempotency-Key","initial-relation-create-key").content(input.toJson()),409);
    }
    @Test void mixedScalarRelationPatchSharesOneCasVersionAndOutboxWhileNoopAndRelationOnlyPreserveValues() throws Exception {
        var source=create(CATEGORY,"mixed-source").get("id").asText();var target=create(TARGET,"mixed-target").get("id").asText();protectDocument(source);protectDocument(target);db.getCollection("outbox_events").deleteMany(new Document());var number=new Document("propertyDefinitionId",id(12)).append("type","number").append("value","7.1200");var input=new Document("title","mixed").append("status","verified").append("propertyValues",new Document("set",List.of(number)).append("unsetPropertyIds",List.of())).append("relations",List.of(new Document("propertyId",REL).append("targetIds",List.of(target,target))));
        var first=call(patch(PATH+"/"+source).header("If-Match","\"v1\"").content(input.toJson()),200).get("data");assertEquals(2,first.get("version").asLong());assertEquals("verified",first.get("status").asText());assertEquals(2,db.getCollection("outbox_events").countDocuments());assertEquals(1L,stored(target).getLong("version"));var ref=stored(source).get("referenceVersion");
        assertEquals(2,call(patch(PATH+"/"+source).header("If-Match","\"v2\"").content(input.toJson()),200).get("data").get("version").asLong());assertEquals(ref,stored(source).get("referenceVersion"));assertEquals(2,db.getCollection("outbox_events").countDocuments());
        var clear=new Document("relations",List.of(new Document("propertyId",REL).append("targetIds",List.of())));var cleared=call(patch(PATH+"/"+source).header("If-Match","\"v2\"").content(clear.toJson()),200).get("data");assertEquals(3,cleared.get("version").asLong());assertEquals("mixed",cleared.get("title").asText());assertEquals("7.1200",cleared.get("propertyValues").get(0).get("value").asText());assertEquals(0,db.getCollection("career_record_relations").countDocuments());assertEquals(4,db.getCollection("outbox_events").countDocuments());call(patch(PATH+"/"+source).header("If-Match","\"v2\"").content(input.toJson()),412);assertDocument(source);assertDocument(target);
    }
    @Test void mixedRelationCreateAndPatchFailuresRollBackScalarsEdgesReferencesAndOutbox() throws Exception {
        var source=create(CATEGORY,"mixed-rollback-source").get("id").asText();var target=create(TARGET,"mixed-rollback-target").get("id").asText();db.getCollection("outbox_events").deleteMany(new Document());var beforeSource=stored(source);var beforeTarget=stored(target);var relations=List.of(new Document("propertyId",REL).append("targetIds",List.of(target)));var patchInput=new Document("title","rollback").append("status","verified").append("relations",relations);rejectOutbox();
        try{call(patch(PATH+"/"+source).header("If-Match","\"v1\"").content(patchInput.toJson()),500);assertEquals(beforeSource,stored(source));assertEquals(beforeTarget,stored(target));assertEquals(0,db.getCollection("career_record_relations").countDocuments());var beforeCount=db.getCollection("career_records").countDocuments();call(post(PATH).header("Idempotency-Key","initial-outbox-rollback-key").content(new Document("categoryId",CATEGORY).append("initialRelations",relations).toJson()),500);assertEquals(beforeCount,db.getCollection("career_records").countDocuments());assertEquals(beforeTarget,stored(target));assertEquals(0,db.getCollection("career_record_relations").countDocuments());}finally{restoreOutbox();}
        db.getCollection("career_records").updateOne(new Document("_id",target),new Document("$set",new Document("userId",OTHER)));call(patch(PATH+"/"+source).header("If-Match","\"v1\"").content(patchInput.toJson()),404);assertEquals(beforeSource,stored(source));assertEquals(0,db.getCollection("outbox_events").countDocuments());
    }
    private Map<String,List<Document>> unidirectionalWriterState() {
        var state=new TreeMap<String,List<Document>>();for(var name:List.of("career_records","career_categories","career_record_relations","career_command_idempotency","outbox_events","users","career_property_mutations"))state.put(name,db.getCollection(name).find().sort(new Document("_id",1)).into(new ArrayList<>()));return state;
    }
    private void unidirectionalTargetLock(String target,String status) {
        var sourceCategory=db.getCollection("career_categories").find(new Document("_id",CATEGORY)).first();var definitions=sourceCategory.getList("propertySchemaV2",Document.class);for(var definition:definitions)if(definition.getString("id").equals(REL))definition.get("config",Document.class).put("inversePropertyId",null);
        db.getCollection("career_categories").updateOne(new Document("_id",CATEGORY),new Document("$set",new Document("propertySchemaV2",definitions)));
        var scalar=def(id(11),"p0","text",new Document());scalar.put("order",1);db.getCollection("career_categories").updateOne(new Document("_id",TARGET),new Document("$push",new Document("propertySchemaV2",scalar)));
        db.getCollection("career_property_mutations").insertOne(mutationLockJob(USER,TARGET,target,status));
    }
    private void unidirectionalWriteRejectsTargetJob(String operation) throws Exception {
        for(var status:List.of("pending","failed")) {
            seed();var target=create(TARGET,"uni-target").get("id").asText();var source=operation.equals("create")?null:create(CATEGORY,"uni-source").get("id").asText();
            var category=db.getCollection("career_categories").find(new Document("_id",CATEGORY)).first();var definitions=category.getList("propertySchemaV2",Document.class);for(var definition:definitions)if(definition.getString("id").equals(REL))definition.get("config",Document.class).put("inversePropertyId",null);db.getCollection("career_categories").updateOne(new Document("_id",CATEGORY),new Document("$set",new Document("propertySchemaV2",definitions)));
            if(operation.equals("remove"))call(put(PATH+"/"+source+"/relations").header("If-Match","\"v1\"").content(new Document("propertyId",REL).append("targetIds",List.of(target)).toJson()),200);
            unidirectionalTargetLock(target,status);var before=unidirectionalWriterState();
            var payload=operation.equals("create")?new Document("categoryId",CATEGORY).append("initialRelations",List.of(new Document("propertyId",REL).append("targetIds",List.of(target)))):new Document("propertyId",REL).append("targetIds",operation.equals("remove")?List.of():List.of(target));
            var request=operation.equals("create")?post(PATH).header("Idempotency-Key","uni-lock-create-key"):put(PATH+"/"+source+"/relations").header("If-Match",operation.equals("remove")?"\"v2\"":"\"v1\"");
            var error=call(request.content(payload.toJson()),409).get("error");assertEquals("CAREER_PROPERTY_MUTATION_ACTIVE",error.get("message").asText());assertEquals(id(300),error.get("details").get("mutationId").asText());assertEquals(status,error.get("details").get("status").asText());assertEquals(status.equals("failed"),error.get("details").get("retryable").asBoolean());assertEquals(before,unidirectionalWriterState(),operation+":"+status);
            db.getCollection("career_property_mutations").updateOne(new Document("_id",id(300)),new Document("$set",new Document("active",false).append("status","completed").append("cursor",1).append("processedCount",1).append("completedAt",new Date())));
            call(request.content(payload.toJson()),operation.equals("create")?201:200);assertEquals(operation.equals("remove")?0:1,db.getCollection("career_record_relations").countDocuments());
        }
    }
    @Test void unidirectionalInsertionRejectsPendingAndFailedTargetJobsAtomically() throws Exception {unidirectionalWriteRejectsTargetJob("insert");}
    @Test void unidirectionalRemovalRejectsPendingAndFailedOldActiveTargetJobsAtomically() throws Exception {unidirectionalWriteRejectsTargetJob("remove");}
    @Test void unidirectionalInitialCreateRejectsPendingAndFailedTargetJobsWithoutReceipt() throws Exception {unidirectionalWriteRejectsTargetJob("create");}
    @Test void unidirectionalRemovalPreservesSoftTrashedTargetWithoutResurrection() throws Exception {
        var source=create(CATEGORY,"uni-trash-source").get("id").asText();var target=create(TARGET,"uni-trash-target").get("id").asText();unidirectionalTargetLock(target,"pending");db.getCollection("career_property_mutations").deleteOne(new Document("_id",id(300)));
        call(put(PATH+"/"+source+"/relations").header("If-Match","\"v1\"").content(new Document("propertyId",REL).append("targetIds",List.of(target)).toJson()),200);db.getCollection("career_records").updateOne(new Document("_id",target),new Document("$set",new Document("deletedAt",new Date()).append("purgeAfter",Date.from(Instant.now().plusSeconds(86400)))));var before=stored(target);
        call(put(PATH+"/"+source+"/relations").header("If-Match","\"v2\"").content(new Document("propertyId",REL).append("targetIds",List.of()).toJson()),200);assertEquals(before,stored(target));assertEquals(0,db.getCollection("career_record_relations").countDocuments());
    }
    @Test void unidirectionalRemovalRejectsUnreadableActiveTargetCategoryButPreservesPurgedTargetCleanup() throws Exception {
        var source=create(CATEGORY,"uni-category-source").get("id").asText();var target=create(TARGET,"uni-category-target").get("id").asText();unidirectionalTargetLock(target,"pending");db.getCollection("career_property_mutations").deleteOne(new Document("_id",id(300)));
        call(put(PATH+"/"+source+"/relations").header("If-Match","\"v1\"").content(new Document("propertyId",REL).append("targetIds",List.of(target)).toJson()),200);
        var foreignCategory=UUID.randomUUID().toString();var raw=new Document(db.getCollection("career_categories").find(new Document("_id",TARGET)).first()).append("_id",foreignCategory).append("key","foreign-"+foreignCategory).append("userId",OTHER);db.getCollection("career_categories").insertOne(raw);
        try {
            db.getCollection("career_records").updateOne(new Document("_id",target),new Document("$set",new Document("categoryId",foreignCategory)));var before=unidirectionalWriterState();var clear=new Document("propertyId",REL).append("targetIds",List.of()).toJson();
            call(put(PATH+"/"+source+"/relations").header("If-Match","\"v2\"").content(clear),404);assertEquals(before,unidirectionalWriterState());
            db.getCollection("career_records").deleteOne(new Document("_id",target).append("userId",USER));call(put(PATH+"/"+source+"/relations").header("If-Match","\"v2\"").content(clear),200);assertEquals(0,db.getCollection("career_record_relations").countDocuments());
        } finally {db.getCollection("career_categories").deleteOne(new Document("_id",foreignCategory).append("userId",OTHER));}
    }
    @Test void reservedPropertyKeysAndIdsRejectDirectSpringWritesWithoutPartialChanges() throws Exception {
        for(var duplicate:List.of("key","id")) {
            seed();var rid=create(CATEGORY,"key-policy-"+duplicate).get("id").asText();
            var category=db.getCollection("career_categories").find(new Document("_id",CATEGORY)).first();
            var definitions=category.getList("propertySchemaV2",Document.class);var first=definitions.getFirst();
            var tombstone=def(duplicate.equals("id")?first.getString("id"):id(98),duplicate.equals("key")?first.getString("key"):"reserved_other","text",new Document());
            tombstone.put("deletedAt",Instant.EPOCH.toString());definitions.add(tombstone);
            db.getCollection("career_categories").updateOne(new Document("_id",CATEGORY),new Document("$set",new Document("propertySchemaV2",definitions)));
            var before=unidirectionalWriterState();
            var failure=call(patch(PATH+"/"+rid).header("If-Match","\"v1\"").content("{\"title\":\"must not overwrite\"}"),409);
            assertEquals("DUPLICATE_CANONICAL_DEFINITION",failure.get("error").get("message").asText());assertEquals(before,unidirectionalWriterState());
            var failedCreate=call(post(PATH).header("Idempotency-Key","reserved-key-create-"+duplicate).content(new Document("categoryId",CATEGORY).toJson()),409);
            assertEquals("DUPLICATE_CANONICAL_DEFINITION",failedCreate.get("error").get("message").asText());assertEquals(before,unidirectionalWriterState());
        }
    }
    @Test void directSpringAllowsDuplicateDisplayNamesWithUniqueKeys() throws Exception {
        var category=db.getCollection("career_categories").find(new Document("_id",CATEGORY)).first();var definitions=category.getList("propertySchemaV2",Document.class);
        definitions.forEach(definition->definition.put("name","같은 이름"));
        db.getCollection("career_categories").updateOne(new Document("_id",CATEGORY),new Document("$set",new Document("propertySchemaV2",definitions)));
        assertEquals(1,create(CATEGORY,"duplicate-display-name").get("version").asLong());
    }}

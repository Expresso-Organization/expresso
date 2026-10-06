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
        for(var collection:List.of("career_records","career_record_relations","outbox_events","career_command_idempotency","identity_sessions","users","career_document_snapshots","career_document_updates","career_record_revisions")) db.getCollection(collection).deleteMany(new Document());
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
}

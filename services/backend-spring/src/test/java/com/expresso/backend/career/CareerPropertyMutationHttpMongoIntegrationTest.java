package com.expresso.backend.career;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import java.nio.file.Path;
import java.time.*;
import java.util.*;
import org.bson.Document;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.JsonNode;
import com.expresso.backend.career.application.CareerMoveTokens;

@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT,properties={"career.writer.enabled=true","career.property-mutation.enabled=true","spring.main.web-application-type=servlet","career.writer.move-secret=disposable-test-secret-at-least-32-bytes","career.property-mutation.secret=disposable-mutation-secret-at-least-32-bytes"})
@AutoConfigureMockMvc
@EnabledIfEnvironmentVariable(named="B1_TEST_MONGO_URL",matches=".+")
class CareerPropertyMutationHttpMongoIntegrationTest {
    static final String DB="expresso_test_b1_java_"+UUID.randomUUID().toString().replace("-","");
    static com.mongodb.client.MongoClient client;
    static com.mongodb.client.MongoDatabase database;
    @Autowired MockMvc mvc;
    @Autowired com.expresso.backend.career.infrastructure.mongo.MongoCareerCommandRepository repository;
    @org.springframework.boot.test.web.server.LocalServerPort int port;
    @DynamicPropertySource static void properties(DynamicPropertyRegistry registry) {
        registry.add("career.writer.mongo-uri",()->System.getenv("B1_TEST_MONGO_URL"));
        registry.add("career.writer.database",()->DB);
    }
    @BeforeAll static void migrate() throws Exception {
        var root=Path.of(System.getProperty("b1RepositoryRoot"));
        var process=new ProcessBuilder(System.getenv().getOrDefault("B1_TEST_NODE","node"),root.resolve("services/backend-spring/src/test/migrate-test-database.mjs").toString(),System.getenv("B1_TEST_MONGO_URL"),DB).inheritIO().start();
        assertEquals(0,process.waitFor());client=com.mongodb.client.MongoClients.create(System.getenv("B1_TEST_MONGO_URL"));database=client.getDatabase(DB);
    }
    @AfterAll static void cleanup() {if(client!=null)try {database.drop();}finally {client.close();}}
    private static com.mongodb.client.MongoDatabase db() {return database;}
    private static Document stored() {return db().getCollection("career_records").find(new Document("_id",CareerPropertyMutationMongoIntegrationTest.RID)).first();}
    @BeforeEach void seed() {
        var user=CareerPropertyMutationMongoIntegrationTest.USER;var category=CareerPropertyMutationMongoIntegrationTest.CAT;var record=CareerPropertyMutationMongoIntegrationTest.RID;var property=CareerPropertyMutationMongoIntegrationTest.PID;var now=new Date();
        for(var name:List.of("career_property_options","career_records","career_categories","career_property_mutations","career_property_mutation_receipts","outbox_events","users","identity_sessions"))db().getCollection(name).deleteMany(new Document());
        db().getCollection("users").insertOne(new Document("_id",user).append("email","mutation-http@example.test").append("displayName","tester").append("planId",CareerPropertyMutationMongoIntegrationTest.id(91)).append("createdAt",now).append("deletionRequestedAt",null));
        var target=CareerPropertyMutationMongoIntegrationTest.definition("number",2,null);
        db().getCollection("career_categories").insertOne(new Document("_id",category).append("userId",user).append("key","mutation-http").append("name","mutation-http").append("icon","folder").append("defaultView","table").append("sortOrder",0).append("propertySchemaV2",List.of(target)).append("version",2L).append("schemaVersion",2L).append("updatedAt",now));
        db().getCollection("career_records").insertOne(new Document("_id",record).append("userId",user).append("categoryId",category).append("title","title").append("status","draft").append("origin","manual").append("version",1L).append("updatedAt",Date.from(Instant.EPOCH)).append("properties",new Document("legacy","do not read")).append("bodyMd","document sentinel").append("blockBody",List.of(new Document("opaque",true))).append("documentVersion",7L).append("latestSnapshotId",CareerPropertyMutationMongoIntegrationTest.id(93)).append("referenceVersion",4L).append("propertyValues",List.of(new Document("propertyDefinitionId",property).append("type","text").append("value","42.1200"),new Document("propertyDefinitionId",CareerPropertyMutationMongoIntegrationTest.OTHER).append("type","text").append("value","unrelated"))));
        var operation=new Document("kind","conversion").append("source",CareerPropertyMutationMongoIntegrationTest.definition("text",1,null)).append("target",target).append("defaultValue",null).append("confirmLossy",true);
        var plan=new Document("userId",user).append("categoryId",category).append("categoryVersion",2).append("schemaVersion",2).append("definitions",List.of(target)).append("recordIds",List.of(record)).append("operation",operation);
        var planJson=CareerPropertyMutationAuthenticationTest.JSON.writeValueAsString(plan);
        db().getCollection("career_property_mutations").insertOne(new Document("_id",CareerPropertyMutationMongoIntegrationTest.JOB).append("userId",user).append("categoryId",category).append("propertyId",property).append("planJson",planJson).append("operationFingerprint",CareerMoveTokens.hash(planJson)).append("status","running").append("active",true).append("cursor",0).append("processedCount",0).append("skippedCount",0).append("attempts",1).append("leaseToken",CareerPropertyMutationMongoIntegrationTest.LEASE).append("leaseUntil",Date.from(Instant.now().plusSeconds(120))).append("lastError",null).append("createdAt",now).append("updatedAt",now).append("completedAt",null).append("commitFence",0L));
    }
    Document scope() {
        return new Document("userId",CareerPropertyMutationMongoIntegrationTest.USER).append("mutationId",CareerPropertyMutationMongoIntegrationTest.JOB).append("recordId",CareerPropertyMutationMongoIntegrationTest.RID).append("operationFingerprint",db().getCollection("career_property_mutations").find().first().getString("operationFingerprint"));
    }
    Document request(String operation) {
        var body=scope();body.remove("userId");
        if(!operation.equals("receipt"))body.append("leaseToken",CareerPropertyMutationMongoIntegrationTest.LEASE);
        if(operation.equals("commit"))body.append("expectedVersion",1).append("propertyValues",new Document("set",List.of(new Document("propertyDefinitionId",CareerPropertyMutationMongoIntegrationTest.PID).append("type","number").append("value","42.1200"))).append("unsetPropertyIds",List.of()));
        return body;
    }
    JsonNode call(String operation,Document body,int expected) throws Exception {
        var claims=scope().append("audience","career-property-mutation").append("expiresAt",Instant.now().plusSeconds(60).toString());
        var request=post(CareerPropertyMutationAuthenticationTest.PATH+operation).header("Authorization","Bearer "+CareerPropertyMutationAuthenticationTest.sign(claims)).contentType("application/json").content(body.toJson());
        if(operation.equals("commit"))request.header("If-Match","\"v"+body.get("expectedVersion")+"\"");
        var response=mvc.perform(request).andReturn().getResponse();assertEquals(expected,response.getStatus(),response.getContentAsString());
        var result=CareerPropertyMutationAuthenticationTest.JSON.readTree(response.getContentAsString());
        if(expected==200 && !result.isNull())assertEquals("\"v"+result.get("data").get("version").asLong()+"\"",response.getHeader("ETag"));
        return result;
    }
    @Test void nullReceiptAndReadUseScopedServiceWithoutSessionToken() throws Exception {
        db().getCollection("identity_sessions").deleteMany(new Document());
        assertTrue(call("receipt",request("receipt"),200).isNull());
        var result=call("read",request("read"),200);assertEquals(1,result.get("data").get("version").asLong());assertTrue(result.get("tombstone").isNull());
    }
    @Test void responseReplaySurvivesExpiredLeaseButStaleCommitRemainsFenced() throws Exception {
        var first=call("commit",request("commit"),200);assertTrue(first.get("changed").asBoolean());assertEquals("42.1200",first.get("data").get("propertyValues").get(0).get("value").asText());
        assertTrue(call("commit",request("commit"),200).get("replayed").asBoolean());
        db().getCollection("career_property_mutations").updateOne(new Document(),new Document("$set",new Document("leaseUntil",Date.from(Instant.EPOCH)).append("active",false).append("status","completed")));
        var replay=call("receipt",request("receipt"),200);assertTrue(replay.get("replayed").asBoolean());assertEquals(2,replay.get("data").get("version").asLong());
        call("commit",request("commit"),409);call("read",request("read"),409);assertEquals(1,db().getCollection("outbox_events").countDocuments());assertEquals(1,db().getCollection("career_property_mutation_receipts").countDocuments());
        assertEquals("document sentinel",stored().getString("bodyMd"));assertEquals(7L,stored().getLong("documentVersion"));
    }
    @Test void dbJobOwnerFingerprintAndPlanMembershipAreCheckedForReceiptEvenWithoutLease() throws Exception {
        var job=db().getCollection("career_property_mutations").find().first();
        db().getCollection("career_property_mutations").updateOne(new Document(),new Document("$set",new Document("userId",CareerPropertyMutationMongoIntegrationTest.CAT)));call("receipt",request("receipt"),409);
        db().getCollection("career_property_mutations").replaceOne(new Document(),job);
        var plan=Document.parse(job.getString("planJson"));plan.put("recordIds",List.of(CareerPropertyMutationMongoIntegrationTest.OTHER));
        var raw=CareerPropertyMutationAuthenticationTest.JSON.writeValueAsString(plan);
        db().getCollection("career_property_mutations").updateOne(new Document(),new Document("$set",new Document("planJson",raw).append("operationFingerprint",CareerMoveTokens.hash(raw))));call("receipt",request("receipt"),409);
        db().getCollection("career_property_mutations").replaceOne(new Document(),job);
        db().getCollection("career_property_mutations").updateOne(new Document(),new Document("$set",new Document("planJson",raw)));call("receipt",request("receipt"),409);
        db().getCollection("career_property_mutations").replaceOne(new Document(),job);
        var wrongOwner=Document.parse(job.getString("planJson")).append("userId",CareerPropertyMutationMongoIntegrationTest.CAT);var ownerJson=CareerPropertyMutationAuthenticationTest.JSON.writeValueAsString(wrongOwner);
        db().getCollection("career_property_mutations").updateOne(new Document(),new Document("$set",new Document("planJson",ownerJson).append("operationFingerprint",CareerMoveTokens.hash(ownerJson))));call("receipt",request("receipt"),409);
        assertEquals(1L,stored().getLong("version"));assertEquals(0,db().getCollection("outbox_events").countDocuments());
    }
    @Test void staleVersionWrongDeltaAndSchemaChangeRemainAtomic() throws Exception {
        var stale=request("commit").append("expectedVersion",2);call("commit",stale,412);
        var wrong=request("commit");wrong.get("propertyValues",Document.class).put("set",List.of(new Document("propertyDefinitionId",CareerPropertyMutationMongoIntegrationTest.PID).append("type","number").append("value","99")));call("commit",wrong,409);
        db().getCollection("career_categories").updateOne(new Document(),new Document("$set",new Document("propertySchemaV2.0.name","tampered")));call("commit",request("commit"),409);
        assertEquals(1L,stored().getLong("version"));assertEquals(0,db().getCollection("outbox_events").countDocuments());assertEquals(0,db().getCollection("career_property_mutation_receipts").countDocuments());
    }
    @Test void actualNodeHttpResponseLossRecoversThroughReceiptWithoutDuplicateWrite() throws Exception {
        db().getCollection("identity_sessions").deleteMany(new Document());
        var root=Path.of(System.getProperty("b1RepositoryRoot"));var script="""
            import assert from 'node:assert/strict';
            import { createCareerPropertyMutationCredential, createSpringPropertyMutationHttpTransport } from './src/modules/career/spring-property-mutation-http.ts';
            import { createSpringPropertyMutationPort } from './src/modules/career/spring-property-mutation-port.ts';
            const scope=JSON.parse(process.env.B2_TEST_SCOPE),command=JSON.parse(process.env.B2_TEST_COMMAND);
            let lose=true;
            const transport=createSpringPropertyMutationHttpTransport(process.env.B2_TEST_ENDPOINT,(scope)=>createCareerPropertyMutationCredential(scope,Buffer.from('disposable-mutation-secret-at-least-32-bytes')),async(url,init)=>{
              const response=await fetch(url,init);if(lose&&url.endsWith('/commit')&&response.ok){lose=false;throw new Error('simulated response loss');}return response;
            });
            const port=createSpringPropertyMutationPort(transport);
            assert.equal(await port.receipt(scope.userId,scope.mutationId,scope.recordId,scope.operationFingerprint),null);
            assert.equal((await port.read(scope.userId,scope.mutationId,scope.recordId,command.leaseToken,scope.operationFingerprint)).data.version,1);
            await assert.rejects(port.commit(scope.userId,command),error=>error.statusCode===503);
            const replay=await port.receipt(scope.userId,scope.mutationId,scope.recordId,scope.operationFingerprint);
            assert.equal(replay.data.version,2);assert.equal(replay.replayed,true);
            assert.equal((await port.commit(scope.userId,command)).data.version,2);
            console.log('mutation Node/Spring HTTP replay verified');
            """;
        var builder=new ProcessBuilder(System.getenv().getOrDefault("B1_TEST_NODE","node"),"--import","tsx","--input-type=module","-e",script).directory(root.resolve("services/backend").toFile()).redirectErrorStream(true);
        builder.environment().put("B2_TEST_SCOPE",scope().toJson());builder.environment().put("B2_TEST_COMMAND",request("commit").toJson());builder.environment().put("B2_TEST_ENDPOINT","http://127.0.0.1:"+port);
        var process=builder.start();var output=new String(process.getInputStream().readAllBytes(),java.nio.charset.StandardCharsets.UTF_8);assertEquals(0,process.waitFor(),output);
        assertEquals(2L,stored().getLong("version"));assertEquals(1,db().getCollection("outbox_events").countDocuments());assertEquals(1,db().getCollection("career_property_mutation_receipts").countDocuments());
    }
    Document privateOptionJob(String kind,String option) {
        var property=CareerPropertyMutationMongoIntegrationTest.PID;var category=CareerPropertyMutationMongoIntegrationTest.CAT;var user=CareerPropertyMutationMongoIntegrationTest.USER;
        var target=CareerPropertyMutationMongoIntegrationTest.definition("multi_select",2,null);target.put("config",new Document("legacyFreeformTags",true).append("options",List.of()));
        db().getCollection("career_categories").updateOne(new Document(),new Document("$set",new Document("propertySchemaV2",List.of(target))));
        db().getCollection("career_property_options").insertMany(List.of(CareerWriterMongoIntegrationTest.privateOption(user,category,property,CareerWriterMongoIntegrationTest.id(401)," Own "),CareerWriterMongoIntegrationTest.privateOption(CareerWriterMongoIntegrationTest.OTHER,category,property,CareerWriterMongoIntegrationTest.id(403),"foreign")));
        var value=new Document("propertyDefinitionId",property).append("type","multi_select").append("value",List.of(option));
        var source=kind.equals("default")?null:new Document(target).append("version",1L);
        var operation=new Document("kind",kind).append("source",source).append("target",target).append("defaultValue",kind.equals("default")?value:null).append("confirmLossy",false);
        var job=db().getCollection("career_property_mutations").find().first();var plan=Document.parse(job.getString("planJson"));plan.put("operation",operation);plan.put("definitions",List.of(target));
        var raw=CareerPropertyMutationAuthenticationTest.JSON.writeValueAsString(plan);
        var snapshot=CareerPropertyMutationAuthenticationTest.JSON.writeValueAsString(List.of(new Document("categoryId",category).append("optionId",CareerWriterMongoIntegrationTest.id(401)).append("propertyId",property).append("rawLabel"," Own ").append("userId",user).append("version",1)));
        db().getCollection("career_property_mutations").updateOne(new Document(),new Document("$set",new Document("planJson",raw).append("operationFingerprint",CareerMoveTokens.hash(raw)).append("privateOptionSnapshotJson",snapshot).append("privateOptionSnapshotFingerprint",CareerMoveTokens.hash(snapshot))));
        var values=new ArrayList<Document>();if(!kind.equals("default"))values.add(value);values.add(new Document("propertyDefinitionId",CareerPropertyMutationMongoIntegrationTest.OTHER).append("type","text").append("value","unrelated"));
        db().getCollection("career_records").updateOne(new Document(),new Document("$set",new Document("propertyValues",values)));
        var command=request("commit");command.put("propertyValues",new Document("set",List.of(value)).append("unsetPropertyIds",List.of()));return command;
    }
    @Test void scopedWorkerAcceptsOnlyRecordOwnerPrivateOptionDefaultAndRollsBackForeignId() throws Exception {
        var foreign=privateOptionJob("default",CareerWriterMongoIntegrationTest.id(403));var before=stored();call("commit",foreign,400);
        assertEquals(before,stored());assertEquals(0,db().getCollection("career_property_mutation_receipts").countDocuments());assertEquals(0,db().getCollection("outbox_events").countDocuments());assertEquals(0L,db().getCollection("career_property_mutations").find().first().getLong("commitFence"));
        seed();var own=privateOptionJob("default",CareerWriterMongoIntegrationTest.id(401));var response=call("commit",own,200);assertEquals(CareerWriterMongoIntegrationTest.id(401),response.get("data").get("propertyValues").get(1).get("value").get(0).asText());
        assertEquals(1,db().getCollection("career_property_mutation_receipts").countDocuments());assertEquals(1,db().getCollection("outbox_events").countDocuments());
    }
    @Test void scopedWorkerConversionPreservesPrivateOptionWithoutChangingRawPlanFingerprint() throws Exception {
        var own=privateOptionJob("conversion",CareerWriterMongoIntegrationTest.id(401));var plan=db().getCollection("career_property_mutations").find().first().getString("planJson");
        var response=call("commit",own,200);assertFalse(response.get("changed").asBoolean());assertEquals(CareerWriterMongoIntegrationTest.id(401),response.get("data").get("propertyValues").get(0).get("value").get(0).asText());
        assertEquals(plan,db().getCollection("career_property_mutations").find().first().getString("planJson"));assertEquals(1,db().getCollection("career_property_mutation_receipts").countDocuments());assertEquals(0,db().getCollection("outbox_events").countDocuments());
    }
    @Test void immutablePrivateSnapshotRejectsMissingOrTamperedRowsAndIgnoresLaterLedgerAppend() throws Exception {
        var own=privateOptionJob("conversion",CareerWriterMongoIntegrationTest.id(401));
        var row=new Document("categoryId",CareerPropertyMutationMongoIntegrationTest.CAT).append("optionId",CareerWriterMongoIntegrationTest.id(401)).append("propertyId",CareerPropertyMutationMongoIntegrationTest.PID).append("rawLabel"," Own ").append("userId",CareerPropertyMutationMongoIntegrationTest.USER).append("version",1);
        var snapshot=CareerPropertyMutationAuthenticationTest.JSON.writeValueAsString(List.of(row));
        var jobs=db().getCollection("career_property_mutations");
        jobs.updateOne(new Document(),new Document("$unset",new Document("privateOptionSnapshotJson","").append("privateOptionSnapshotFingerprint","")));
        assertEquals("PRIVATE_OPTION_SNAPSHOT_REQUIRED",call("commit",own,409).get("error").get("message").asText());
        jobs.updateOne(new Document(),new Document("$set",new Document("privateOptionSnapshotJson",snapshot).append("privateOptionSnapshotFingerprint","a".repeat(64))));call("commit",own,409);
        for(var invalid:List.of(new Document(row).append("userId",CareerWriterMongoIntegrationTest.OTHER),new Document(row).append("propertyId",CareerPropertyMutationMongoIntegrationTest.OTHER),new Document(row).append("version",2),new Document(row).append("metadata",new Document()))) {
            var raw=CareerPropertyMutationAuthenticationTest.JSON.writeValueAsString(List.of(invalid));jobs.updateOne(new Document(),new Document("$set",new Document("privateOptionSnapshotJson",raw).append("privateOptionSnapshotFingerprint",CareerMoveTokens.hash(raw))));call("commit",own,409);
        }
        var duplicated=CareerPropertyMutationAuthenticationTest.JSON.writeValueAsString(List.of(row,row));jobs.updateOne(new Document(),new Document("$set",new Document("privateOptionSnapshotJson",duplicated).append("privateOptionSnapshotFingerprint",CareerMoveTokens.hash(duplicated))));call("commit",own,409);
        jobs.updateOne(new Document(),new Document("$set",new Document("privateOptionSnapshotJson",snapshot).append("privateOptionSnapshotFingerprint",CareerMoveTokens.hash(snapshot))));
        db().getCollection("career_property_options").deleteMany(new Document());
        db().getCollection("career_property_options").insertOne(CareerWriterMongoIntegrationTest.privateOption(CareerPropertyMutationMongoIntegrationTest.USER,CareerPropertyMutationMongoIntegrationTest.CAT,CareerPropertyMutationMongoIntegrationTest.PID,CareerWriterMongoIntegrationTest.id(402)," Own "));
        assertFalse(call("commit",own,200).get("changed").asBoolean());assertEquals(1,db().getCollection("career_property_mutation_receipts").countDocuments());
        jobs.updateOne(new Document(),new Document("$unset",new Document("privateOptionSnapshotJson","").append("privateOptionSnapshotFingerprint","")));
        assertTrue(call("receipt",request("receipt"),200).get("replayed").asBoolean());
    }
    static final String REL_TARGET=CareerPropertyMutationMongoIntegrationTest.id(701),REL_CAT=CareerPropertyMutationMongoIntegrationTest.id(702),REL_INVERSE=CareerPropertyMutationMongoIntegrationTest.id(703),REL_RESTORE=CareerPropertyMutationMongoIntegrationTest.id(704);
    Document relationDefinition(String property,String target,String inverse,long version,String deleted) {return new Document("id",property).append("key","links").append("name","links").append("type","relation").append("required",false).append("system",false).append("config",new Document("targetCategoryId",target).append("inversePropertyId",inverse).append("cardinality","multiple").append("deletePolicy","nullify")).append("order",0).append("version",version).append("deletedAt",deleted);}
    Document relationEdge(String source,String property,String target,String inverse,int sequence) {return new Document("_id",CareerPropertyMutationMongoIntegrationTest.id(710+sequence)).append("userId",CareerPropertyMutationMongoIntegrationTest.USER).append("sourceRecordId",source).append("sourcePropertyId",property).append("targetRecordId",target).append("inversePropertyId",inverse).append("cardinality","multiple").append("deletePolicy","nullify").append("createdBy",sequence==0?"user":"ai").append("createdAt",Date.from(Instant.parse("2026-10-01T01:02:03.123Z"))).append("updatedAt",Date.from(Instant.parse("2026-10-02T01:02:03.456Z")));}
    void relationJob(String job,String record,List<String> members,Document source,Document target,String kind,long categoryVersion) {
        var category=CareerPropertyMutationMongoIntegrationTest.CAT;var user=CareerPropertyMutationMongoIntegrationTest.USER;
        db().getCollection("career_categories").updateOne(new Document("_id",category),new Document("$set",new Document("propertySchemaV2",List.of(target)).append("version",categoryVersion).append("schemaVersion",categoryVersion)));
        var plan=new Document("userId",user).append("categoryId",category).append("categoryVersion",categoryVersion).append("schemaVersion",categoryVersion).append("definitions",List.of(target)).append("recordIds",members).append("operation",new Document("kind",kind).append("source",source).append("target",target).append("defaultValue",null).append("confirmLossy",true));
        var raw=CareerPropertyMutationAuthenticationTest.JSON.writeValueAsString(plan);var now=new Date();
        db().getCollection("career_property_mutations").replaceOne(new Document("_id",job),new Document("_id",job).append("userId",user).append("categoryId",category).append("propertyId",target.getString("id")).append("planJson",raw).append("operationFingerprint",CareerMoveTokens.hash(raw)).append("status","running").append("active",true).append("cursor",0).append("processedCount",0).append("skippedCount",0).append("attempts",1).append("leaseToken",CareerPropertyMutationMongoIntegrationTest.LEASE).append("leaseUntil",Date.from(Instant.now().plusSeconds(120))).append("lastError",null).append("createdAt",now).append("updatedAt",now).append("completedAt",null).append("commitFence",0L),new com.mongodb.client.model.ReplaceOptions().upsert(true));
    }
    Document relationRequest(String job,String record,String operation,long version,List<String> targets,Document versions) {
        var raw=db().getCollection("career_property_mutations").find(new Document("_id",job)).first();var body=new Document("mutationId",job).append("recordId",record).append("operationFingerprint",raw.getString("operationFingerprint"));
        if(!operation.equals("receipt"))body.append("leaseToken",CareerPropertyMutationMongoIntegrationTest.LEASE);
        if(operation.equals("commit"))body.append("expectedVersion",version).append("relationChanges",new Document("targetRecordIds",targets).append("targetRecordVersions",versions));return body;
    }
    JsonNode relationCall(String operation,Document body,int expected) throws Exception {
        var claims=new Document(body);claims.remove("leaseToken");claims.remove("expectedVersion");claims.remove("relationChanges");claims.remove("propertyValues");claims.append("userId",CareerPropertyMutationMongoIntegrationTest.USER).append("audience","career-property-mutation").append("expiresAt",Instant.now().plusSeconds(60).toString());
        var request=post(CareerPropertyMutationAuthenticationTest.PATH+operation).header("Authorization","Bearer "+CareerPropertyMutationAuthenticationTest.sign(claims)).contentType("application/json").content(body.toJson());if(operation.equals("commit"))request.header("If-Match","\"v"+body.get("expectedVersion")+"\"");
        var response=mvc.perform(request).andReturn().getResponse();assertEquals(expected,response.getStatus(),response.getContentAsString());var result=CareerPropertyMutationAuthenticationTest.JSON.readTree(response.getContentAsString());if(expected==200&&!result.isNull())assertEquals("\"v"+result.get("data").get("version").asLong()+"\"",response.getHeader("ETag"));return result;
    }
    List<Document> seedRelations(boolean selfInverse) {
        var category=CareerPropertyMutationMongoIntegrationTest.CAT;var source=CareerPropertyMutationMongoIntegrationTest.RID;var property=CareerPropertyMutationMongoIntegrationTest.PID;
        db().getCollection("career_record_relations").deleteMany(new Document());db().getCollection("career_relation_property_tombstones").deleteMany(new Document());
        var targetRecord=new Document(stored()).append("_id",REL_TARGET).append("categoryId",selfInverse?category:REL_CAT).append("version",4L).append("propertyValues",List.of());db().getCollection("career_records").insertOne(targetRecord);
        var target=relationDefinition(property,selfInverse?category:REL_CAT,selfInverse?property:REL_INVERSE,2,"2026-10-09T00:00:00Z");
        if(!selfInverse) {var raw=new Document(db().getCollection("career_categories").find(new Document("_id",category)).first()).append("_id",REL_CAT).append("key","inverse").append("propertySchemaV2",List.of(relationDefinition(REL_INVERSE,category,property,1,null))).append("version",1L).append("schemaVersion",1L);db().getCollection("career_categories").insertOne(raw);}
        var edges=List.of(relationEdge(source,property,REL_TARGET,selfInverse?property:REL_INVERSE,0),relationEdge(REL_TARGET,selfInverse?property:REL_INVERSE,source,property,1));db().getCollection("career_record_relations").insertMany(edges);
        relationJob(CareerPropertyMutationMongoIntegrationTest.JOB,source,selfInverse?List.of(source,REL_TARGET):List.of(source),new Document(target).append("version",1L).append("deletedAt",null),target,"deletion",2);return edges;
    }
    void beginRelationRestore(boolean selfInverse) {
        var job=db().getCollection("career_property_mutations").find(new Document("_id",CareerPropertyMutationMongoIntegrationTest.JOB)).first();var plan=Document.parse(job.getString("planJson"));var deleted=plan.get("operation",Document.class).get("target",Document.class);
        db().getCollection("career_property_mutations").updateOne(new Document("_id",job.getString("_id")),new Document("$set",new Document("active",false).append("status","completed").append("cursor",selfInverse?2:1).append("processedCount",selfInverse?2:1)));
        relationJob(REL_RESTORE,CareerPropertyMutationMongoIntegrationTest.RID,selfInverse?List.of(CareerPropertyMutationMongoIntegrationTest.RID,REL_TARGET):List.of(CareerPropertyMutationMongoIntegrationTest.RID),deleted,new Document(deleted).append("version",3L).append("deletedAt",null),"restoration",3);
    }
    @Test void relationDeletionRestorationPreservesExactEdgesAndReceiptReplayAtomically() throws Exception {
        var originals=seedRelations(false);var job=CareerPropertyMutationMongoIntegrationTest.JOB;var record=CareerPropertyMutationMongoIntegrationTest.RID;
        var read=relationCall("read",relationRequest(job,record,"read",1,List.of(),new Document()),200);assertEquals(originals.getFirst().getString("_id"),read.get("relation").get("edges").get(0).get("id").asText());
        var command=relationRequest(job,record,"commit",1,List.of(),new Document(REL_TARGET,4L));relationCall("commit",new Document(command).append("expectedVersion",2),412);
        var first=relationCall("commit",command,200);assertTrue(first.get("changed").asBoolean());assertEquals(2,first.get("data").get("version").asLong());assertEquals(0,db().getCollection("career_record_relations").countDocuments());assertEquals(1,db().getCollection("career_relation_property_tombstones").countDocuments());assertEquals(4L,db().getCollection("career_records").find(new Document("_id",REL_TARGET)).first().getLong("version"));
        assertTrue(relationCall("commit",command,200).get("replayed").asBoolean());assertEquals(2,db().getCollection("outbox_events").countDocuments());
        beginRelationRestore(false);var restoredRead=relationCall("read",relationRequest(REL_RESTORE,record,"read",2,List.of(),new Document()),200);assertEquals(2,restoredRead.get("relation").get("tombstone").get("sourceRecordVersion").asLong());
        var restore=relationRequest(REL_RESTORE,record,"commit",2,List.of(REL_TARGET),new Document(REL_TARGET,4L));assertEquals(3,relationCall("commit",restore,200).get("data").get("version").asLong());
        assertEquals(originals,db().getCollection("career_record_relations").find().sort(new Document("_id",1)).into(new ArrayList<>()));assertEquals(0,db().getCollection("career_relation_property_tombstones").countDocuments());assertTrue(db().getCollection("career_property_mutation_receipts").find(new Document("mutationId",REL_RESTORE)).first().containsKey("relationRestoration"));
        db().getCollection("career_property_mutations").updateOne(new Document("_id",REL_RESTORE),new Document("$set",new Document("leaseUntil",Date.from(Instant.EPOCH))));assertTrue(relationCall("receipt",relationRequest(REL_RESTORE,record,"receipt",3,List.of(),new Document()),200).get("replayed").asBoolean());relationCall("commit",restore,409);
        assertEquals("document sentinel",stored().getString("bodyMd"));assertEquals(7L,stored().getLong("documentVersion"));
    }
    private List<Document> seedIncomingOnlyRelationJob() {
        seedRelations(false);db().getCollection("career_record_relations").deleteMany(new Document("sourceRecordId",CareerPropertyMutationMongoIntegrationTest.RID));return db().getCollection("career_record_relations").find().sort(new Document("_id",1)).into(new ArrayList<>());
    }
    @Test void incomingOnlyRelationDeletionRestorationPreservesRawProvenanceAndReceiptReplay() throws Exception {
        var originals=seedIncomingOnlyRelationJob();var job=CareerPropertyMutationMongoIntegrationTest.JOB;var record=CareerPropertyMutationMongoIntegrationTest.RID;
        var read=relationCall("read",relationRequest(job,record,"read",1,List.of(),new Document()),200);
        assertEquals(0,read.get("relation").get("edges").size());assertEquals(1,read.get("relation").get("inverseEdges").size());assertEquals(4,read.get("relation").get("targetRecordVersions").get(REL_TARGET).asLong());
        var command=relationRequest(job,record,"commit",1,List.of(),new Document(REL_TARGET,4L));assertTrue(relationCall("commit",command,200).get("changed").asBoolean());
        assertEquals(0,db().getCollection("career_record_relations").countDocuments());var backup=db().getCollection("career_relation_property_tombstones").find().first();assertEquals(List.of(),backup.getList("forwardEdges",Document.class));assertEquals(originals,backup.getList("inverseEdges",Document.class));assertEquals(2,db().getCollection("outbox_events").countDocuments());
        var after=unidirectionalMutationState();assertTrue(relationCall("commit",command,200).get("replayed").asBoolean());var replay=unidirectionalMutationState();after.remove("users");replay.remove("users");assertEquals(after,replay);
        beginRelationRestore(false);var restore=relationRequest(REL_RESTORE,record,"commit",2,List.of(REL_TARGET),new Document(REL_TARGET,4L));assertEquals(3,relationCall("commit",restore,200).get("data").get("version").asLong());
        assertEquals(originals,db().getCollection("career_record_relations").find().sort(new Document("_id",1)).into(new ArrayList<>()));assertEquals(0,db().getCollection("career_relation_property_tombstones").countDocuments());assertEquals(4,db().getCollection("outbox_events").countDocuments());
        after=unidirectionalMutationState();assertTrue(relationCall("commit",restore,200).get("replayed").asBoolean());replay=unidirectionalMutationState();after.remove("users");replay.remove("users");assertEquals(after,replay);
    }
    @Test void incomingOnlyRelationEndpointCasRejectsStaleDeletionAndReferenceChangedRestoreAtomically() throws Exception {
        var originals=seedIncomingOnlyRelationJob();var record=CareerPropertyMutationMongoIntegrationTest.RID;
        var command=relationRequest(CareerPropertyMutationMongoIntegrationTest.JOB,record,"commit",1,List.of(),new Document(REL_TARGET,4L));
        db().getCollection("career_records").updateOne(new Document("_id",REL_TARGET),new Document("$inc",new Document("version",1L)));var before=unidirectionalMutationState();relationCall("commit",command,412);assertEquals(before,unidirectionalMutationState());
        relationCall("commit",relationRequest(CareerPropertyMutationMongoIntegrationTest.JOB,record,"commit",1,List.of(),new Document(REL_TARGET,5L)),200);beginRelationRestore(false);
        db().getCollection("career_records").updateOne(new Document("_id",REL_TARGET),new Document("$inc",new Document("referenceVersion",1L)));before=unidirectionalMutationState();relationCall("commit",relationRequest(REL_RESTORE,record,"commit",2,List.of(REL_TARGET),new Document(REL_TARGET,5L)),409);assertEquals(before,unidirectionalMutationState());assertEquals(originals,db().getCollection("career_relation_property_tombstones").find().first().getList("inverseEdges",Document.class));
    }
    @Test void forwardOnlyInverseRelationRestoreRequiresEndpointDefinitionBinding() throws Exception {
        seedRelations(false);db().getCollection("career_record_relations").deleteMany(new Document("sourceRecordId",REL_TARGET));var source=CareerPropertyMutationMongoIntegrationTest.RID;
        relationCall("commit",relationRequest(CareerPropertyMutationMongoIntegrationTest.JOB,source,"commit",1,List.of(),new Document(REL_TARGET,4L)),200);beginRelationRestore(false);
        db().getCollection("career_relation_property_tombstones").updateOne(new Document("recordId",source),new Document("$set",new Document("inverseDefinitionBindings",List.of())));var before=unidirectionalMutationState();
        var error=relationCall("commit",relationRequest(REL_RESTORE,source,"commit",2,List.of(REL_TARGET),new Document(REL_TARGET,4L)),409).get("error");assertEquals("RESTORATION_TOMBSTONE_CHANGED",error.get("message").asText());assertEquals(before,unidirectionalMutationState());
    }
    @Test void incomingOnlyRelationRestoreHonorsOppositeSingleSlotHeldByAnotherIncomingRow() throws Exception {
        seedIncomingOnlyRelationJob();var source=CareerPropertyMutationMongoIntegrationTest.RID;var property=CareerPropertyMutationMongoIntegrationTest.PID;
        db().getCollection("career_categories").updateOne(new Document("_id",REL_CAT),new Document("$set",new Document("propertySchemaV2.0.config.cardinality","single")));db().getCollection("career_record_relations").updateOne(new Document("sourceRecordId",REL_TARGET),new Document("$set",new Document("cardinality","single")));
        relationCall("commit",relationRequest(CareerPropertyMutationMongoIntegrationTest.JOB,source,"commit",1,List.of(),new Document(REL_TARGET,4L)),200);beginRelationRestore(false);
        var other=CareerPropertyMutationMongoIntegrationTest.id(719);db().getCollection("career_records").insertOne(new Document(stored()).append("_id",other).append("version",1L).append("referenceVersion",0L));db().getCollection("career_record_relations").insertOne(relationEdge(other,property,REL_TARGET,REL_INVERSE,3));var before=unidirectionalMutationState();
        var error=relationCall("commit",relationRequest(REL_RESTORE,source,"commit",2,List.of(REL_TARGET),new Document(REL_TARGET,4L)),409).get("error");assertEquals("INVERSE_RELATION_CONFLICT",error.get("message").asText());assertEquals(before,unidirectionalMutationState());
    }
    @Test void selfInverseBatchRestorationAcceptsOnlyExactSameGenerationJournalEdges() throws Exception {
        var originals=seedRelations(true);var job=CareerPropertyMutationMongoIntegrationTest.JOB;var source=CareerPropertyMutationMongoIntegrationTest.RID;
        relationCall("commit",relationRequest(job,source,"commit",1,List.of(),new Document(REL_TARGET,4L)),200);relationCall("commit",relationRequest(job,REL_TARGET,"commit",4,List.of(),new Document()),200);assertEquals(2,db().getCollection("career_relation_property_tombstones").countDocuments());
        beginRelationRestore(true);relationCall("commit",relationRequest(REL_RESTORE,source,"commit",2,List.of(REL_TARGET),new Document(REL_TARGET,4L)),200);
        var second=relationRequest(REL_RESTORE,REL_TARGET,"commit",4,List.of(),new Document(source,3L));var replay=relationCall("commit",second,200);assertFalse(replay.get("changed").asBoolean());assertTrue(relationCall("commit",second,200).get("replayed").asBoolean());
        assertEquals(originals,db().getCollection("career_record_relations").find().sort(new Document("_id",1)).into(new ArrayList<>()));assertEquals(0,db().getCollection("career_relation_property_tombstones").countDocuments());assertEquals(4L,db().getCollection("career_records").find(new Document("_id",REL_TARGET)).first().getLong("version"));
    }
    @Test void relationRestoreRejectsSourceUserWriteInverseReferenceEditAndChangedSemanticsWithoutPartialWrites() throws Exception {
        for(var scenario:List.of("source","reference","schema","trash","generation")) {
            seed();var originals=seedRelations(false);var source=CareerPropertyMutationMongoIntegrationTest.RID;
            relationCall("commit",relationRequest(CareerPropertyMutationMongoIntegrationTest.JOB,source,"commit",1,List.of(),new Document(REL_TARGET,4L)),200);beginRelationRestore(false);
            if(scenario.equals("source"))db().getCollection("career_records").updateOne(new Document("_id",source),new Document("$set",new Document("title","new user title").append("version",3L)));
            if(scenario.equals("reference"))db().getCollection("career_records").updateOne(new Document("_id",REL_TARGET),new Document("$inc",new Document("referenceVersion",1L)));
            if(scenario.equals("schema"))db().getCollection("career_categories").updateOne(new Document("_id",REL_CAT),new Document("$set",new Document("propertySchemaV2.0.config.cardinality","single").append("propertySchemaV2.0.version",2L).append("version",2L).append("schemaVersion",2L)));
            if(scenario.equals("trash"))db().getCollection("career_records").updateOne(new Document("_id",REL_TARGET),new Document("$set",new Document("deletedAt",new Date()).append("purgeAfter",Date.from(Instant.now().plusSeconds(86400)))));
            if(scenario.equals("generation"))db().getCollection("career_relation_property_tombstones").updateOne(new Document(),new Document("$set",new Document("deletionMutationId",CareerPropertyMutationMongoIntegrationTest.id(799))));
            var before=stored();var backup=db().getCollection("career_relation_property_tombstones").find().first();var outbox=db().getCollection("outbox_events").countDocuments();
            relationCall("commit",relationRequest(REL_RESTORE,source,"commit",scenario.equals("source")?3:2,List.of(REL_TARGET),new Document(REL_TARGET,4L)),scenario.equals("trash")?404:409);
            assertEquals(before,stored(),scenario);assertEquals(backup,db().getCollection("career_relation_property_tombstones").find().first(),scenario);assertEquals(outbox,db().getCollection("outbox_events").countDocuments(),scenario);assertEquals(0,db().getCollection("career_property_mutation_receipts").countDocuments(new Document("mutationId",REL_RESTORE)),scenario);assertEquals(0,db().getCollection("career_record_relations").countDocuments(),scenario);
        }
    }
    @Test void relationDeletionRejectsStaleTargetAndForeignOwnerWithAtomicRollback() throws Exception {
        seedRelations(false);var source=CareerPropertyMutationMongoIntegrationTest.RID;var job=CareerPropertyMutationMongoIntegrationTest.JOB;var originals=db().getCollection("career_record_relations").find().into(new ArrayList<>());
        relationCall("commit",relationRequest(job,source,"commit",1,List.of(REL_TARGET),new Document(REL_TARGET,4L)),409);
        relationCall("commit",relationRequest(job,source,"commit",1,List.of(),new Document(REL_TARGET,3L)),412);
        db().getCollection("career_records").updateOne(new Document("_id",REL_TARGET),new Document("$set",new Document("userId",CareerWriterMongoIntegrationTest.OTHER)));
        relationCall("commit",relationRequest(job,source,"commit",1,List.of(),new Document(REL_TARGET,4L)),404);
        assertEquals(originals,db().getCollection("career_record_relations").find().into(new ArrayList<>()));assertEquals(0,db().getCollection("career_relation_property_tombstones").countDocuments());assertEquals(0,db().getCollection("outbox_events").countDocuments());assertEquals(1L,stored().getLong("version"));
    }
    @Test void relationMutationOutboxFailureRollsBackEdgesTombstoneAndReceiptTogether() throws Exception {
        var originals=seedRelations(false);var before=stored();db().runCommand(new Document("collMod","outbox_events").append("validator",new Document("$jsonSchema",new Document("required",List.of("never_present")))).append("validationLevel","strict").append("validationAction","error"));
        try {relationCall("commit",relationRequest(CareerPropertyMutationMongoIntegrationTest.JOB,CareerPropertyMutationMongoIntegrationTest.RID,"commit",1,List.of(),new Document(REL_TARGET,4L)),500);
        assertEquals(originals,db().getCollection("career_record_relations").find().sort(new Document("_id",1)).into(new ArrayList<>()));assertEquals(before,stored());assertEquals(0,db().getCollection("career_relation_property_tombstones").countDocuments());assertEquals(0,db().getCollection("career_property_mutation_receipts").countDocuments());
        } finally {db().runCommand(new Document("collMod","outbox_events").append("validator",new Document()).append("validationLevel","strict"));}
    }
    void relationHttpResponseLossProbe(Document command,long nextVersion) throws Exception {
        var root=Path.of(System.getProperty("b1RepositoryRoot"));var scope=new Document(command);for(var key:List.of("leaseToken","expectedVersion","relationChanges"))scope.remove(key);scope.append("userId",CareerPropertyMutationMongoIntegrationTest.USER);
        var script="""
            import assert from 'node:assert/strict';
            import { createCareerPropertyMutationCredential, createSpringPropertyMutationHttpTransport } from './src/modules/career/spring-property-mutation-http.ts';
            import { createSpringPropertyMutationPort } from './src/modules/career/spring-property-mutation-port.ts';
            const scope=JSON.parse(process.env.B2_TEST_SCOPE),command=JSON.parse(process.env.B2_TEST_COMMAND),next=Number(process.env.B2_TEST_NEXT_VERSION);
            let lost=true;const transport=createSpringPropertyMutationHttpTransport(process.env.B2_TEST_ENDPOINT,s=>createCareerPropertyMutationCredential(s,Buffer.from('disposable-mutation-secret-at-least-32-bytes')),async(url,init)=>{const result=await fetch(url,init);if(lost&&url.endsWith('/commit')&&result.ok){lost=false;throw new Error('simulated response loss');}return result;});
            const port=createSpringPropertyMutationPort(transport);const read=await port.read(scope.userId,scope.mutationId,scope.recordId,command.leaseToken,scope.operationFingerprint);assert.ok(read.relation);assert.equal(read.data.version,command.expectedVersion);
            await assert.rejects(port.commit(scope.userId,command),error=>error.statusCode===503);const recovered=await port.receipt(scope.userId,scope.mutationId,scope.recordId,scope.operationFingerprint);assert.equal(recovered.data.version,next);assert.equal(recovered.replayed,true);assert.equal((await port.commit(scope.userId,command)).replayed,true);
            console.log('relation Node/Spring HTTP durable replay verified');
            """;
        var builder=new ProcessBuilder(System.getenv().getOrDefault("B1_TEST_NODE","node"),"--import","tsx","--input-type=module").directory(root.resolve("services/backend").toFile()).redirectErrorStream(true);builder.environment().put("B2_TEST_SCOPE",scope.toJson());builder.environment().put("B2_TEST_COMMAND",command.toJson());builder.environment().put("B2_TEST_ENDPOINT","http://127.0.0.1:"+port);builder.environment().put("B2_TEST_NEXT_VERSION",Long.toString(nextVersion));
        var process=builder.start();process.getOutputStream().write(script.getBytes(java.nio.charset.StandardCharsets.UTF_8));process.getOutputStream().close();var output=new String(process.getInputStream().readAllBytes(),java.nio.charset.StandardCharsets.UTF_8);assertEquals(0,process.waitFor(),output);
    }
    @Test void actualNodeRelationHttpUnknownResponseRecoversDeletionAndSelfInverseRestoreWithoutDuplicates() throws Exception {
        var originals=seedRelations(true);var source=CareerPropertyMutationMongoIntegrationTest.RID;var job=CareerPropertyMutationMongoIntegrationTest.JOB;
        relationHttpResponseLossProbe(relationRequest(job,source,"commit",1,List.of(),new Document(REL_TARGET,4L)),2);relationCall("commit",relationRequest(job,REL_TARGET,"commit",4,List.of(),new Document()),200);beginRelationRestore(true);
        relationHttpResponseLossProbe(relationRequest(REL_RESTORE,source,"commit",2,List.of(REL_TARGET),new Document(REL_TARGET,4L)),3);relationHttpResponseLossProbe(relationRequest(REL_RESTORE,REL_TARGET,"commit",4,List.of(),new Document(source,3L)),4);
        assertEquals(originals,db().getCollection("career_record_relations").find().sort(new Document("_id",1)).into(new ArrayList<>()));assertEquals(4,db().getCollection("career_property_mutation_receipts").countDocuments());assertEquals(0,db().getCollection("career_relation_property_tombstones").countDocuments());assertEquals(4,db().getCollection("outbox_events").countDocuments());
    }
    @Test void actualMongoConcurrentInverseReferenceWriteForcesTransactionRetryAndPreservesBackup() throws Exception {
        seedRelations(false);var source=CareerPropertyMutationMongoIntegrationTest.RID;relationCall("commit",relationRequest(CareerPropertyMutationMongoIntegrationTest.JOB,source,"commit",1,List.of(),new Document(REL_TARGET,4L)),200);beginRelationRestore(false);
        var body=relationRequest(REL_RESTORE,source,"commit",2,List.of(REL_TARGET),new Document(REL_TARGET,4L));var claims=new Document("userId",CareerPropertyMutationMongoIntegrationTest.USER).append("mutationId",REL_RESTORE).append("recordId",source).append("operationFingerprint",body.getString("operationFingerprint")).append("audience","career-property-mutation").append("expiresAt",Instant.now().plusSeconds(60).toString());
        var actor=new com.expresso.backend.career.mutation.CareerPropertyMutationCredentials("disposable-mutation-secret-at-least-32-bytes",Clock.systemUTC()).authenticate(CareerPropertyMutationAuthenticationTest.sign(claims));var mutations=new com.expresso.backend.career.application.CareerPropertyMutationService(repository,Clock.systemUTC());var command=new com.expresso.backend.career.application.CareerRelationPropertyMutationCommand(REL_RESTORE,source,2,CareerPropertyMutationMongoIntegrationTest.LEASE,body.getString("operationFingerprint"),List.of(REL_TARGET),Map.of(REL_TARGET,4L));var first=new java.util.concurrent.atomic.AtomicBoolean(true);var attempts=new java.util.concurrent.atomic.AtomicInteger();
        var backup=db().getCollection("career_relation_property_tombstones").find().first();var outbox=db().getCollection("outbox_events").countDocuments();
        var error=assertThrows(com.expresso.backend.career.application.CareerCommandException.class,()->repository.serviceTransaction(actor,tx->{attempts.incrementAndGet();mutations.read(tx,REL_RESTORE,source,CareerPropertyMutationMongoIntegrationTest.LEASE,body.getString("operationFingerprint"));if(first.getAndSet(false))db().getCollection("career_records").updateOne(new Document("_id",REL_TARGET),new Document("$inc",new Document("referenceVersion",1L)));return mutations.commitRelation(tx,command);}));
        assertEquals("RESTORATION_TARGET_CHANGED",error.code());assertTrue(attempts.get()>=2,"same business transaction must retry after actual Mongo write conflict");assertEquals(backup,db().getCollection("career_relation_property_tombstones").find().first());assertEquals(outbox,db().getCollection("outbox_events").countDocuments());assertEquals(0,db().getCollection("career_record_relations").countDocuments());assertEquals(0,db().getCollection("career_property_mutation_receipts").countDocuments(new Document("mutationId",REL_RESTORE)));
    }
    @Test void selfInverseRestoreRejectsUserReplacementOfPreviouslyRestoredJournalEdge() throws Exception {
        seedRelations(true);var source=CareerPropertyMutationMongoIntegrationTest.RID;var job=CareerPropertyMutationMongoIntegrationTest.JOB;
        relationCall("commit",relationRequest(job,source,"commit",1,List.of(),new Document(REL_TARGET,4L)),200);relationCall("commit",relationRequest(job,REL_TARGET,"commit",4,List.of(),new Document()),200);beginRelationRestore(true);relationCall("commit",relationRequest(REL_RESTORE,source,"commit",2,List.of(REL_TARGET),new Document(REL_TARGET,4L)),200);
        var original=db().getCollection("career_record_relations").find(new Document("sourceRecordId",REL_TARGET)).first();db().getCollection("career_record_relations").deleteOne(new Document("_id",original.getString("_id")));var userReplacement=new Document(original).append("_id",CareerPropertyMutationMongoIntegrationTest.id(780)).append("updatedAt",new Date());db().getCollection("career_record_relations").insertOne(userReplacement);
        var backup=db().getCollection("career_relation_property_tombstones").find().first();relationCall("commit",relationRequest(REL_RESTORE,REL_TARGET,"commit",4,List.of(),new Document(source,3L)),409);assertEquals(userReplacement,db().getCollection("career_record_relations").find(new Document("sourceRecordId",REL_TARGET)).first());assertEquals(backup,db().getCollection("career_relation_property_tombstones").find().first());
    }
    @Test void customTimestampDeletionRestorationPreservesCanonicalDateTombstoneExactly() throws Exception {
        var source=CareerPropertyMutationMongoIntegrationTest.RID;var property=CareerPropertyMutationMongoIntegrationTest.PID;var old=CareerPropertyMutationMongoIntegrationTest.definition("created_time",1,null);var deleted=CareerPropertyMutationMongoIntegrationTest.definition("created_time",2,"2026-10-09T00:00:00Z");var value=new Document("propertyDefinitionId",property).append("type","date").append("value",new Document("precision","datetime").append("start","2026-10-09T01:02:03.123456789+09:00").append("end",null).append("timezone","Asia/Seoul"));
        db().getCollection("career_records").updateOne(new Document("_id",source),new Document("$set",new Document("propertyValues",List.of(value))));relationJob(CareerPropertyMutationMongoIntegrationTest.JOB,source,List.of(source),old,deleted,"deletion",2);
        var deletion=request("commit");deletion.put("propertyValues",new Document("set",List.of()).append("unsetPropertyIds",List.of(property)));call("commit",deletion,200);beginRelationRestore(false);
        var restore=relationRequest(REL_RESTORE,source,"commit",2,List.of(),new Document());restore.remove("relationChanges");restore.append("propertyValues",new Document("set",List.of(value)).append("unsetPropertyIds",List.of()));relationCall("commit",restore,200);assertEquals(List.of(value),stored().getList("propertyValues",Document.class));assertFalse(stored().get("propertyValueTombstones",Document.class).containsKey(property));
    }
    @Test void relationMutationSupportsExistingRecordsWithoutReferenceVersion() throws Exception {
        var originals=seedRelations(false);db().getCollection("career_records").updateMany(new Document(),new Document("$unset",new Document("referenceVersion","")));var source=CareerPropertyMutationMongoIntegrationTest.RID;
        relationCall("commit",relationRequest(CareerPropertyMutationMongoIntegrationTest.JOB,source,"commit",1,List.of(),new Document(REL_TARGET,4L)),200);beginRelationRestore(false);relationCall("commit",relationRequest(REL_RESTORE,source,"commit",2,List.of(REL_TARGET),new Document(REL_TARGET,4L)),200);assertEquals(originals,db().getCollection("career_record_relations").find().sort(new Document("_id",1)).into(new ArrayList<>()));
    }
    @Test void sharedInverseBatchUpdatesOnlyMatchedGenerationReferenceGuardsAndRestoresAllOriginalEdges() throws Exception {
        var originals=new ArrayList<>(seedRelations(false));var source=CareerPropertyMutationMongoIntegrationTest.RID;var third=CareerPropertyMutationMongoIntegrationTest.id(783);db().getCollection("career_records").insertOne(new Document(stored()).append("_id",third));var forward=relationEdge(third,CareerPropertyMutationMongoIntegrationTest.PID,REL_TARGET,REL_INVERSE,2);var inverse=relationEdge(REL_TARGET,REL_INVERSE,third,CareerPropertyMutationMongoIntegrationTest.PID,3);db().getCollection("career_record_relations").insertMany(List.of(forward,inverse));originals.add(forward);originals.add(inverse);
        var currentJob=db().getCollection("career_property_mutations").find().first();var operation=Document.parse(currentJob.getString("planJson")).get("operation",Document.class);relationJob(CareerPropertyMutationMongoIntegrationTest.JOB,source,List.of(source,third),operation.get("source",Document.class),operation.get("target",Document.class),"deletion",2);
        for(var id:List.of(source,third))relationCall("commit",relationRequest(CareerPropertyMutationMongoIntegrationTest.JOB,id,"commit",1,List.of(),new Document(REL_TARGET,4L)),200);
        db().getCollection("career_property_mutations").updateOne(new Document("_id",CareerPropertyMutationMongoIntegrationTest.JOB),new Document("$set",new Document("active",false).append("status","completed").append("cursor",2).append("processedCount",2)));
        relationJob(REL_RESTORE,source,List.of(source,third),operation.get("target",Document.class),new Document(operation.get("target",Document.class)).append("version",3L).append("deletedAt",null),"restoration",3);
        for(var id:List.of(source,third))relationCall("commit",relationRequest(REL_RESTORE,id,"commit",2,List.of(REL_TARGET),new Document(REL_TARGET,4L)),200);
        assertEquals(originals,db().getCollection("career_record_relations").find().sort(new Document("_id",1)).into(new ArrayList<>()));assertEquals(4L,db().getCollection("career_records").find(new Document("_id",REL_TARGET)).first().getLong("version"));assertEquals(0,db().getCollection("career_relation_property_tombstones").countDocuments());assertEquals(8,db().getCollection("outbox_events").countDocuments());
    }
    @Test void relationWorkerCannotBypassAnotherOwnedCategoryJobAndHarmlessInverseRenameCanRestore() throws Exception {
        var originals=seedRelations(false);var source=CareerPropertyMutationMongoIntegrationTest.RID;var otherProperty=CareerPropertyMutationMongoIntegrationTest.id(784);var otherJob=CareerPropertyMutationMongoIntegrationTest.id(785);var now=new Date();var inverse=relationDefinition(REL_INVERSE,CareerPropertyMutationMongoIntegrationTest.CAT,CareerPropertyMutationMongoIntegrationTest.PID,1,null);var scalar=CareerWriterMongoIntegrationTest.def(otherProperty,"extra","text",new Document());scalar.put("order",1);
        db().getCollection("career_categories").updateOne(new Document("_id",REL_CAT),new Document("$set",new Document("propertySchemaV2",List.of(inverse,scalar)).append("version",2L).append("schemaVersion",2L)));
        var plan=new Document("userId",CareerPropertyMutationMongoIntegrationTest.USER).append("categoryId",REL_CAT).append("categoryVersion",2).append("schemaVersion",2).append("definitions",List.of(inverse,scalar)).append("recordIds",List.of(REL_TARGET)).append("operation",new Document("kind","default").append("source",null).append("target",scalar).append("defaultValue",new Document("propertyDefinitionId",otherProperty).append("type","text").append("value","default")).append("confirmLossy",false));var raw=CareerPropertyMutationAuthenticationTest.JSON.writeValueAsString(plan);
        db().getCollection("career_property_mutations").insertOne(new Document("_id",otherJob).append("userId",CareerPropertyMutationMongoIntegrationTest.USER).append("categoryId",REL_CAT).append("propertyId",otherProperty).append("planJson",raw).append("operationFingerprint",CareerMoveTokens.hash(raw)).append("status","pending").append("active",true).append("cursor",0).append("processedCount",0).append("skippedCount",0).append("attempts",0).append("leaseToken",null).append("leaseUntil",null).append("lastError",null).append("createdAt",now).append("updatedAt",now).append("completedAt",null).append("commitFence",0L));
        var deletion=relationRequest(CareerPropertyMutationMongoIntegrationTest.JOB,source,"commit",1,List.of(),new Document(REL_TARGET,4L));var error=relationCall("commit",deletion,409).get("error");assertEquals("CAREER_PROPERTY_MUTATION_ACTIVE",error.get("message").asText());assertEquals(otherJob,error.get("details").get("mutationId").asText());assertEquals(originals,db().getCollection("career_record_relations").find().sort(new Document("_id",1)).into(new ArrayList<>()));assertEquals(0,db().getCollection("career_relation_property_tombstones").countDocuments());
        db().getCollection("career_property_mutations").updateOne(new Document("_id",otherJob),new Document("$set",new Document("active",false).append("status","completed").append("cursor",1).append("processedCount",1)));relationCall("commit",deletion,200);beginRelationRestore(false);
        db().getCollection("career_categories").updateOne(new Document("_id",REL_CAT),new Document("$set",new Document("propertySchemaV2.0.name","harmless rename").append("propertySchemaV2.0.version",2L).append("version",3L).append("schemaVersion",3L)));relationCall("commit",relationRequest(REL_RESTORE,source,"commit",2,List.of(REL_TARGET),new Document(REL_TARGET,4L)),200);assertEquals(originals,db().getCollection("career_record_relations").find().sort(new Document("_id",1)).into(new ArrayList<>()));
    }
    @Test void relationDeletionRejectsInverseEdgeSemanticsBeforeCreatingRestorationBackup() throws Exception {
        for(var field:List.of("cardinality","deletePolicy","inversePropertyId")) {
            seed();seedRelations(false);Object value=switch(field){case "cardinality"->"single";case "deletePolicy"->"restrict";default->null;};db().getCollection("career_record_relations").updateOne(new Document("sourceRecordId",REL_TARGET),new Document("$set",new Document(field,value)));var edges=db().getCollection("career_record_relations").find().sort(new Document("_id",1)).into(new ArrayList<>());var before=stored();
            relationCall("commit",relationRequest(CareerPropertyMutationMongoIntegrationTest.JOB,CareerPropertyMutationMongoIntegrationTest.RID,"commit",1,List.of(),new Document(REL_TARGET,4L)),409);assertEquals(before,stored());assertEquals(edges,db().getCollection("career_record_relations").find().sort(new Document("_id",1)).into(new ArrayList<>()));assertEquals(0,db().getCollection("career_relation_property_tombstones").countDocuments());assertEquals(0,db().getCollection("career_property_mutation_receipts").countDocuments());assertEquals(0,db().getCollection("outbox_events").countDocuments());
        }
    }
    private List<Document> seedUnidirectionalRelationJob() {
        seedRelations(false);var source=CareerPropertyMutationMongoIntegrationTest.RID;var property=CareerPropertyMutationMongoIntegrationTest.PID;db().getCollection("career_record_relations").deleteMany(new Document("sourceRecordId",REL_TARGET));db().getCollection("career_record_relations").updateOne(new Document("sourceRecordId",source),new Document("$set",new Document("inversePropertyId",null)));
        var target=relationDefinition(property,REL_CAT,null,2,"2026-10-09T00:00:00Z");relationJob(CareerPropertyMutationMongoIntegrationTest.JOB,source,List.of(source),new Document(target).append("version",1L).append("deletedAt",null),target,"deletion",2);return db().getCollection("career_record_relations").find().sort(new Document("_id",1)).into(new ArrayList<>());
    }
    private Map<String,List<Document>> unidirectionalMutationState() {
        var state=new TreeMap<String,List<Document>>();for(var name:List.of("career_records","career_categories","career_record_relations","career_relation_property_tombstones","career_property_mutation_receipts","outbox_events","users","career_property_mutations"))state.put(name,db().getCollection(name).find().sort(new Document("_id",1)).into(new ArrayList<>()));return state;
    }
    private void unrelatedUnidirectionalTargetJob(String status) {
        var scalar=CareerWriterMongoIntegrationTest.def(CareerWriterMongoIntegrationTest.id(11),"p0","text",new Document());scalar.put("order",1);db().getCollection("career_categories").updateOne(new Document("_id",REL_CAT),new Document("$push",new Document("propertySchemaV2",scalar)));
        db().getCollection("career_property_mutations").insertOne(CareerWriterMongoIntegrationTest.mutationLockJob(CareerPropertyMutationMongoIntegrationTest.USER,REL_CAT,REL_TARGET,status));
    }
    private void completeUnidirectionalTargetJob() {db().getCollection("career_property_mutations").updateOne(new Document("_id",CareerWriterMongoIntegrationTest.id(300)),new Document("$set",new Document("active",false).append("status","completed").append("cursor",1).append("processedCount",1).append("completedAt",new Date())));}
    @Test void unidirectionalSchemaDeletionRejectsUnrelatedPendingAndFailedTargetJobsAtomically() throws Exception {
        for(var status:List.of("pending","failed")) {
            seed();var originals=seedUnidirectionalRelationJob();unrelatedUnidirectionalTargetJob(status);var command=relationRequest(CareerPropertyMutationMongoIntegrationTest.JOB,CareerPropertyMutationMongoIntegrationTest.RID,"commit",1,List.of(),new Document(REL_TARGET,4L));var before=unidirectionalMutationState();
            var error=relationCall("commit",command,409).get("error");assertEquals("CAREER_PROPERTY_MUTATION_ACTIVE",error.get("message").asText());assertEquals(CareerWriterMongoIntegrationTest.id(300),error.get("details").get("mutationId").asText());assertEquals(status,error.get("details").get("status").asText());assertEquals(before,unidirectionalMutationState());assertEquals(originals,db().getCollection("career_record_relations").find().sort(new Document("_id",1)).into(new ArrayList<>()));
            completeUnidirectionalTargetJob();relationCall("commit",command,200);assertEquals(0,db().getCollection("career_record_relations").countDocuments());assertEquals(1,db().getCollection("career_property_mutation_receipts").countDocuments());assertEquals(1,db().getCollection("career_relation_property_tombstones").countDocuments());
        }
    }
    @Test void unidirectionalSchemaRestoreRejectsUnrelatedTargetJobsButReceiptReplayRemainsReadOnly() throws Exception {
        for(var status:List.of("pending","failed")) {
            seed();var originals=seedUnidirectionalRelationJob();var source=CareerPropertyMutationMongoIntegrationTest.RID;var deletion=CareerPropertyMutationMongoIntegrationTest.JOB;relationCall("commit",relationRequest(deletion,source,"commit",1,List.of(),new Document(REL_TARGET,4L)),200);beginRelationRestore(false);unrelatedUnidirectionalTargetJob(status);var before=unidirectionalMutationState();
            assertTrue(relationCall("receipt",relationRequest(deletion,source,"receipt",2,List.of(),new Document()),200).get("replayed").asBoolean());var replayState=unidirectionalMutationState();var replayExpected=new TreeMap<>(before);var replayActual=new TreeMap<>(replayState);replayExpected.remove("users");replayActual.remove("users");assertEquals(replayExpected,replayActual);before=replayState;
            var command=relationRequest(REL_RESTORE,source,"commit",2,List.of(REL_TARGET),new Document(REL_TARGET,4L));var error=relationCall("commit",command,409).get("error");assertEquals("CAREER_PROPERTY_MUTATION_ACTIVE",error.get("message").asText());assertEquals(CareerWriterMongoIntegrationTest.id(300),error.get("details").get("mutationId").asText());assertEquals(status,error.get("details").get("status").asText());assertEquals(before,unidirectionalMutationState());
            completeUnidirectionalTargetJob();relationCall("commit",command,200);assertEquals(originals,db().getCollection("career_record_relations").find().sort(new Document("_id",1)).into(new ArrayList<>()));assertEquals(0,db().getCollection("career_relation_property_tombstones").countDocuments());
        }
    }
}

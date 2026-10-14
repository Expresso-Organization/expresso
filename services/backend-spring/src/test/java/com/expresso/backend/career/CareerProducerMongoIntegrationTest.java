package com.expresso.backend.career;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import java.nio.charset.StandardCharsets;
import java.net.URI;
import java.net.http.*;
import java.nio.file.*;
import java.security.MessageDigest;
import java.time.*;
import java.util.*;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.bson.Document;
import com.mongodb.client.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import com.expresso.backend.career.application.CareerMoveTokens;

@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT,properties={"career.writer.enabled=true", "career.integration.enabled=true", "career.property-mutation.enabled=true", "career.property-mutation.secret=disposable-mutation-secret-at-least-32-bytes", "spring.main.web-application-type=servlet", "career.writer.move-secret=disposable-test-move-secret-at-least-32-bytes", "career.integration.ai-secret=disposable-ai-secret-at-least-32-bytes", "career.integration.interview-secret=disposable-interview-secret-at-least-32-bytes", "career.product.service-secret=disposable-product-secret-at-least-32-bytes"})
@AutoConfigureMockMvc
@EnabledIfEnvironmentVariable(named="B1_TEST_MONGO_URL", matches=".+")
class CareerProducerMongoIntegrationTest {
    static final String DB="expresso_test_b1_java_"+UUID.randomUUID().toString().replace("-","");
    static final String USER=id(2), CATEGORY=id(3), SOURCE=id(4), OP=id(5), ANSWER=id(6), QUESTION=id(7), SESSION=id(8), PROPERTY=id(12);
    static final String PATH="/internal/career/integration/business", TOKEN="exps_"+"A".repeat(43), LEASE=id(90);
    static final String AI_SECRET="disposable-ai-secret-at-least-32-bytes", INTERVIEW_SECRET="disposable-interview-secret-at-least-32-bytes";
    static final JsonMapper JSON=JsonMapper.builder().build();
    static MongoClient client; static MongoDatabase db;
    @Autowired MockMvc mvc;
    @org.springframework.boot.test.web.server.LocalServerPort int port;
    @DynamicPropertySource static void properties(DynamicPropertyRegistry registry) {
        registry.add("career.writer.mongo-uri",()->System.getenv("B1_TEST_MONGO_URL")); registry.add("career.writer.database",()->DB);
    }
    @BeforeAll static void migrate() throws Exception {
        var root=Path.of(System.getProperty("b1RepositoryRoot"));
        var p=new ProcessBuilder(System.getenv().getOrDefault("B1_TEST_NODE","node"),root.resolve("services/backend-spring/src/test/migrate-test-database.mjs").toString(),System.getenv("B1_TEST_MONGO_URL"),DB).inheritIO().start();
        assertEquals(0,p.waitFor()); client=MongoClients.create(System.getenv("B1_TEST_MONGO_URL")); db=client.getDatabase(DB);
    }
    @AfterAll static void cleanup() {if(client!=null) {try {db.drop();} finally {client.close();}}}
    @BeforeEach void seed() {
        for(var name:List.of("career_property_options","career_property_mutations","users","identity_sessions","career_records","career_record_relations","career_command_idempotency","outbox_events","career_categories","career_ai_proposals","interview_career_operations","career_product_operations","answers","questions","interview_sessions")) db.getCollection(name).deleteMany(new Document());
        db.getCollection("users").insertOne(new Document("_id",USER).append("email","producer@example.test").append("displayName","producer").append("planId",id(91)).append("createdAt",new Date()).append("deletionRequestedAt",null));
        db.getCollection("identity_sessions").insertOne(new Document("_id",id(92)).append("userId",USER).append("tokenHash",CareerMoveTokens.hash(TOKEN)).append("expiresAt",Date.from(Instant.now().plusSeconds(3600))).append("createdAt",new Date()).append("revokedAt",null));
        var def=new Document("id",PROPERTY).append("key","number").append("name","number").append("type","number").append("required",false).append("system",false).append("config",new Document()).append("order",0).append("version",1L).append("deletedAt",null);
        db.getCollection("career_categories").insertOne(new Document("_id",CATEGORY).append("key","producer").append("userId",USER).append("isSystem",false).append("name","producer").append("icon","folder").append("defaultView","list").append("sortOrder",0).append("propertySchema",new Document()).append("propertySchemaV2",List.of(def)).append("schemaVersion",1L).append("version",1L).append("updatedAt",new Date()));
    }
    static String id(int n) {return String.format("00000000-0000-4000-8000-%012d",n);}
    String createRecord() throws Exception {
        var res=mvc.perform(post("/v1/career/records").header("Authorization","Bearer "+TOKEN).header("Idempotency-Key","producer-fixture-create-key").contentType("application/json").content("{\"categoryId\":\""+CATEGORY+"\"}")).andReturn().getResponse(); assertEquals(201,res.getStatus(),res.getContentAsString());
        db.getCollection("career_command_idempotency").deleteMany(new Document()); return JSON.readTree(res.getContentAsString()).get("data").get("id").asText();
    }
    Document patchBusiness(String rid,long version,Document... patches) {return new Document("kind","patch").append("recordId",rid).append("expectedVersion",version).append("expectedCategoryVersion",1).append("patches",List.of(patches));}
    Document intent(String producer,Document business) throws Exception {
        var scope=new Document("producer",producer).append("userId",USER).append("sourceId",SOURCE).append("operationId",OP).append("business",business).append("document",null);
        scope.append("fingerprint",HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(JSON.writeValueAsBytes(canonical(scope)))));
        return scope.append("state","running").append("leaseToken",LEASE).append("leaseUntil",Instant.now().plusSeconds(120).toString()).append("attempts",1).append("fence",1).append("businessResult",null).append("documentResult",null).append("lastError",null).append("createdAt",Instant.now().toString()).append("updatedAt",Instant.now().toString());
    }
    static Object canonical(Object input) {
        if(input==null) return List.of("null");
        if(input instanceof Map<?,?> map) {var sorted=new TreeMap<String,Object>(); map.forEach((k,v)->sorted.put((String)k,canonical(v))); return List.of("object",sorted.entrySet().stream().map(e->List.of(e.getKey(),e.getValue())).toList());}
        if(input instanceof List<?> list) return List.of("array",list.stream().map(CareerProducerMongoIntegrationTest::canonical).toList());
        if(input instanceof Number number) {var value=number.doubleValue(); return List.of("number",String.format("%016x",Double.doubleToLongBits(value==0?0:value)));}
        if(input instanceof Boolean) return List.of("boolean",input); return List.of("string",input);
    }
    void source(Document intent) {
        var name=intent.getString("producer").equals("ai-proposal")?"career_ai_proposals":"interview_career_operations";
        var row=new Document("_id",SOURCE).append("userId",USER).append("writerIntegration",intent);
        var business=intent.get("business",Document.class); var now=new Date();
        if(name.equals("career_ai_proposals")) {
            row.append("recordId",business.getString("recordId")).append("status","ready").append("baseDocumentVersion",0).append("selection",new Document()).append("prompt","fixture").append("summary",null).append("commands",List.of()).append("propertyChanges",List.of()).append("progress",null).append("expiresAt",Date.from(Instant.now().plusSeconds(3600))).append("createdAt",now).append("updatedAt",now);
            for(var field:List.of("beforeSnapshotId","afterSnapshotId","beforeChecksum","afterChecksum","revisionId","appliedDocumentVersion")) row.append(field,null);
        } else {
            row.append("kind","answer").append("sessionId",SESSION).append("questionId",QUESTION).append("answerId",ANSWER).append("recordId",business.getString("recordId")).append("expectedAnswerVersion",null).append("answerVersion",1).append("inputIdempotencyKey","spring-producer-answer-key").append("requestHash","a".repeat(64)).append("input",new Document("inputType","text").append("transcript","answer")).append("active",true).append("result",null).append("createdAt",now).append("updatedAt",now);
            db.getCollection("interview_sessions").insertOne(new Document("_id",SESSION).append("userId",USER).append("brewId",id(51)).append("status","open").append("questionCount",1).append("currentOrder",0).append("answeredCount",0).append("createdAt",now).append("updatedAt",now));
            db.getCollection("questions").insertOne(new Document("_id",QUESTION).append("userId",USER).append("interviewSessionId",SESSION).append("orderNo",0).append("text","question").append("skipped",false).append("basis",new Document()).append("active",true).append("variant",0).append("createdAt",now));
            db.getCollection("answers").insertOne(new Document("_id",ANSWER).append("userId",USER).append("questionId",QUESTION).append("inputType","text").append("transcript","answer").append("createdRecordId",business.getString("recordId")).append("version",1L).append("writerPending",true).append("writerOperationId",OP).append("requestHash","a".repeat(64)).append("updatedAt",now));
        }
        db.getCollection(name).insertOne(row);
    }
    Document request(Document intent) {var req=new Document(); for(var field:List.of("producer","userId","sourceId","operationId","fingerprint")) req.append(field,intent.get(field)); return req.append("leaseToken",LEASE);}
    String token(Document intent,String secret) throws Exception {
        var claims=request(intent); claims.remove("leaseToken"); claims.append("audience","career-producer").append("expiresAt",Instant.now().plusSeconds(240).toString()); return sign(claims,secret);
    }
    static String sign(Document claims,String secret) throws Exception {
        var payload=Base64.getUrlEncoder().withoutPadding().encodeToString(JSON.writeValueAsBytes(claims)); var mac=Mac.getInstance("HmacSHA256"); mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8),"HmacSHA256")); return "expi."+payload+"."+Base64.getUrlEncoder().withoutPadding().encodeToString(mac.doFinal(payload.getBytes(StandardCharsets.US_ASCII)));
    }
    JsonNode call(Document intent,String bearer,String match,int status) throws Exception {
        var req=post(PATH).header("Authorization","Bearer "+bearer).contentType("application/json").content(request(intent).toJson()); if(match!=null) req.header("If-Match",match);
        var res=mvc.perform(req).andReturn().getResponse(); assertEquals(status,res.getStatus(),res.getContentAsString());
        var json=JSON.readTree(res.getContentAsString()); if(status==200) assertEquals("\"v"+json.get("data").get("version").asLong()+"\"",res.getHeader("ETag")); return json;
    }
    @Test void aiCannotApplyToAnotherOwnedRecordOutsideItsProposalBinding() throws Exception {
        var rid=createRecord(); var intent=intent("ai-proposal",patchBusiness(rid,1,new Document("title","wrong record"))); source(intent);
        // 동일 사용자의 정상 기록도 다른 Proposal의 대상이면 작업 범위를 벗어납니다.
        var other=db.getCollection("career_records").find(new Document("_id",rid)).first(); other.put("_id",id(97)); db.getCollection("career_records").insertOne(other);
        db.getCollection("career_ai_proposals").updateOne(new Document("_id",SOURCE),new Document("$set",new Document("recordId",id(97))));
        call(intent,token(intent,AI_SECRET),"\"v1\"",409); assertEquals("",db.getCollection("career_records").find(new Document("_id",rid)).first().getString("title")); assertEquals(0,db.getCollection("career_command_idempotency").countDocuments());
    }
    @Test void interviewCannotCommitAfterInputChangesWithoutAVersionChange() throws Exception {
        var intent=intent("interview",new Document("kind","create").append("expectedCategoryVersion",1).append("input",new Document("categoryId",CATEGORY))); source(intent);
        db.getCollection("answers").updateOne(new Document("_id",ANSWER),new Document("$set",new Document("transcript","changed without version")));
        call(intent,token(intent,INTERVIEW_SECRET),null,409);
        db.getCollection("answers").updateOne(new Document("_id",ANSWER),new Document("$set",new Document("transcript","answer").append("inputType","voice")));
        call(intent,token(intent,INTERVIEW_SECRET),null,409); assertEquals(0,db.getCollection("career_records").countDocuments()); assertEquals(0,db.getCollection("career_command_idempotency").countDocuments());
    }
    @Test void patchStoresReceiptAndSourceAtomicallyAndReplaysAfterResponseLoss() throws Exception {
        var rid=createRecord(); db.getCollection("career_records").updateOne(new Document("_id",rid),new Document("$set",new Document("bodyMd","YJS-OWNER").append("documentVersion",7L).append("properties",new Document("legacy","keep"))));
        var delta=new Document("propertyValues",new Document("set",List.of(new Document("propertyDefinitionId",PROPERTY).append("type","number").append("value","12345678901234567890.123400"))).append("unsetPropertyIds",List.of()));
        var intent=intent("ai-proposal",patchBusiness(rid,1,new Document("title","accepted"),delta)); source(intent);
        var response=call(intent,token(intent,AI_SECRET),"\"v1\"",200);
        assertFalse(response.get("replayed").asBoolean()); assertEquals(3,response.get("data").get("version").asInt()); assertEquals("12345678901234567890.123400",response.get("data").get("propertyValues").get(0).get("value").asText());
        var record=db.getCollection("career_records").find(new Document("_id",rid)).first(); assertEquals("YJS-OWNER",record.getString("bodyMd")); assertEquals(7L,record.getLong("documentVersion")); assertEquals(new Document("legacy","keep"),record.get("properties"));
        var stored=db.getCollection("career_ai_proposals").find(new Document("_id",SOURCE)).first().get("writerIntegration",Document.class); assertNotNull(stored.get("businessResult")); assertEquals(2,((Number)stored.get("fence")).intValue());
        db.getCollection("career_ai_proposals").updateOne(new Document("_id",SOURCE),new Document("$set",new Document("writerIntegration.state","cancelled").append("writerIntegration.leaseUntil",Instant.EPOCH.toString())));
        assertTrue(call(intent,token(intent,AI_SECRET),"\"v1\"",200).get("replayed").asBoolean()); assertEquals(1,db.getCollection("career_command_idempotency").countDocuments()); assertEquals(1,db.getCollection("outbox_events").countDocuments());
    }
    @Test void staleLeaseCancelledScopeTamperAndCategoryDriftCannotWrite() throws Exception {
        var rid=createRecord(); var intent=intent("ai-proposal",patchBusiness(rid,1,new Document("title","blocked"))); source(intent);
        call(intent,token(intent,AI_SECRET),null,400); call(intent,token(intent,AI_SECRET),"\"v2\"",412);
        db.getCollection("career_categories").updateOne(new Document("_id",CATEGORY),new Document("$inc",new Document("version",1L))); call(intent,token(intent,AI_SECRET),"\"v1\"",409);
        db.getCollection("career_categories").updateOne(new Document("_id",CATEGORY),new Document("$set",new Document("version",1L)));
        db.getCollection("career_ai_proposals").updateOne(new Document("_id",SOURCE),new Document("$set",new Document("writerIntegration.leaseUntil",Instant.EPOCH.toString()))); call(intent,token(intent,AI_SECRET),"\"v1\"",409);
        db.getCollection("career_ai_proposals").updateOne(new Document("_id",SOURCE),new Document("$set",new Document("writerIntegration.leaseUntil",Instant.now().plusSeconds(120).toString()).append("writerIntegration.business.patches",List.of(new Document("title","tampered"))))); call(intent,token(intent,AI_SECRET),"\"v1\"",409);
        assertEquals(1L,db.getCollection("career_records").find(new Document("_id",rid)).first().getLong("version")); assertEquals(0,db.getCollection("career_command_idempotency").countDocuments());
    }
    @Test void credentialsAreProducerScopedShortLivedAndNeverUserSessions() throws Exception {
        var rid=createRecord(); var intent=intent("ai-proposal",patchBusiness(rid,1,new Document("title","auth"))); source(intent);
        call(intent,TOKEN,"\"v1\"",401); call(intent,token(intent,INTERVIEW_SECRET),"\"v1\"",401);
        var claims=request(intent); claims.remove("leaseToken"); claims.append("audience","career-producer").append("expiresAt",Instant.now().plusSeconds(600).toString()); call(intent,sign(claims,AI_SECRET),"\"v1\"",401);
        claims.put("expiresAt",Instant.now().minusSeconds(1).toString()); call(intent,sign(claims,AI_SECRET),"\"v1\"",401);
        claims.put("expiresAt",Instant.now().plusSeconds(60).toString()); claims.put("unknown","forbidden"); call(intent,sign(claims,AI_SECRET),"\"v1\"",401);
        var altered=new Document(intent); altered.put("operationId",id(88)); call(intent,token(altered,AI_SECRET),"\"v1\"",403);
        var res=mvc.perform(post("/v1/career/records").header("Authorization","Bearer "+token(intent,AI_SECRET)).header("Idempotency-Key","internal-cannot-be-user-key").contentType("application/json").content("{\"categoryId\":\""+CATEGORY+"\"}")).andReturn().getResponse(); assertEquals(401,res.getStatus());
    }
    @Test void interviewCreatesWithOwnedOriginAndHistoricalReceiptSurvivesNewAnswerVersion() throws Exception {
        var input=new Document("categoryId",CATEGORY).append("title","interview answer").append("propertyValues",List.of());
        var intent=intent("interview",new Document("kind","create").append("expectedCategoryVersion",1).append("input",input)); source(intent);
        var response=call(intent,token(intent,INTERVIEW_SECRET),null,200); var rid=response.get("data").get("id").asText();
        assertEquals("interview",db.getCollection("career_records").find(new Document("_id",rid)).first().getString("origin"));
        assertEquals(0L,db.getCollection("interview_sessions").find(new Document("_id",SESSION)).first().get("answeredCount",Number.class).longValue());
        db.getCollection("answers").updateOne(new Document("_id",ANSWER),new Document("$set",new Document("version",2L).append("writerOperationId",id(99))));
        db.getCollection("interview_career_operations").updateOne(new Document("_id",SOURCE),new Document("$set",new Document("active",false).append("writerIntegration.state","completed").append("writerIntegration.leaseUntil",null)));
        assertTrue(call(intent,token(intent,INTERVIEW_SECRET),null,200).get("replayed").asBoolean()); assertEquals(1,db.getCollection("career_records").countDocuments());
    }
    @Test void inactiveInterviewLedgerCannotCreateEvenWithValidLease() throws Exception {
        var intent=intent("interview",new Document("kind","create").append("expectedCategoryVersion",1).append("input",new Document("categoryId",CATEGORY))); source(intent);
        db.getCollection("interview_career_operations").updateOne(new Document("_id",SOURCE),new Document("$set",new Document("active",false)));
        call(intent,token(intent,INTERVIEW_SECRET),null,409); assertEquals(0,db.getCollection("career_records").countDocuments());
    }
    @Test void interviewCreateCannotReplaceAnAlreadyBoundAnswerRecord() throws Exception {
        var intent=intent("interview",new Document("kind","create").append("expectedCategoryVersion",1).append("input",new Document("categoryId",CATEGORY))); source(intent);
        db.getCollection("answers").updateOne(new Document("_id",ANSWER),new Document("$set",new Document("createdRecordId",id(98))));
        call(intent,token(intent,INTERVIEW_SECRET),null,409); assertEquals(0,db.getCollection("career_records").countDocuments());
    }
    @Test void interviewStrengtheningCannotRewriteAManualRecord() throws Exception {
        var rid=createRecord(); var intent=intent("interview",patchBusiness(rid,1,new Document("title","strengthen"))); source(intent);
        call(intent,token(intent,INTERVIEW_SECRET),"\"v1\"",409); assertEquals("",db.getCollection("career_records").find(new Document("_id",rid)).first().getString("title"));
    }
    @Test void deletedUserAndMismatchedAnswerOrQuestionCannotCommit() throws Exception {
        var intent=intent("interview",new Document("kind","create").append("expectedCategoryVersion",1).append("input",new Document("categoryId",CATEGORY))); source(intent);
        db.getCollection("questions").updateOne(new Document("_id",QUESTION),new Document("$set",new Document("active",false))); call(intent,token(intent,INTERVIEW_SECRET),null,409);
        db.getCollection("questions").updateOne(new Document("_id",QUESTION),new Document("$set",new Document("active",true)));
        db.getCollection("answers").updateOne(new Document("_id",ANSWER),new Document("$set",new Document("writerOperationId",id(99)))); call(intent,token(intent,INTERVIEW_SECRET),null,409);
        db.getCollection("answers").updateOne(new Document("_id",ANSWER),new Document("$set",new Document("writerOperationId",OP)));
        db.getCollection("users").updateOne(new Document("_id",USER),new Document("$set",new Document("deletionRequestedAt",new Date()))); call(intent,token(intent,INTERVIEW_SECRET),null,401);
        assertEquals(0,db.getCollection("career_records").countDocuments());
    }
    @Test void cleanupRequiresMatchingAnswerVersionAndUnverifiedInterviewRecord() throws Exception {
        var rid=createRecord(); var intent=intent("interview",patchBusiness(rid,1,new Document("title","cleanup"))); source(intent);
        db.getCollection("interview_career_operations").updateOne(new Document("_id",SOURCE),new Document("$set",new Document("kind","cleanup")));
        db.getCollection("answers").updateOne(new Document("_id",ANSWER),new Document("$set",new Document("writerPending",false).append("recordVersion",1L)));
        call(intent,token(intent,INTERVIEW_SECRET),"\"v1\"",409);
        db.getCollection("career_records").updateOne(new Document("_id",rid),new Document("$set",new Document("origin","interview").append("status","verified"))); call(intent,token(intent,INTERVIEW_SECRET),"\"v1\"",409);
        db.getCollection("career_records").updateOne(new Document("_id",rid),new Document("$set",new Document("status","draft")));
        db.getCollection("answers").updateOne(new Document("_id",ANSWER),new Document("$set",new Document("version",2L))); call(intent,token(intent,INTERVIEW_SECRET),"\"v1\"",409);
        db.getCollection("answers").updateOne(new Document("_id",ANSWER),new Document("$set",new Document("version",1L))); assertEquals("cleanup",call(intent,token(intent,INTERVIEW_SECRET),"\"v1\"",200).get("data").get("title").asText());
        // 정상 cleanup 이후 Answer가 새 기록 버전으로 진행해도 이전 receipt는 그대로 replay합니다.
        db.getCollection("answers").updateOne(new Document("_id",ANSWER),new Document("$set",new Document("recordVersion",2L)));
        db.getCollection("interview_career_operations").updateOne(new Document("_id",SOURCE),new Document("$set",new Document("active",false).append("writerIntegration.state","completed").append("writerIntegration.leaseUntil",null)));
        var receiptCount=db.getCollection("career_command_idempotency").countDocuments(); var outboxCount=db.getCollection("outbox_events").countDocuments();
        assertTrue(call(intent,token(intent,INTERVIEW_SECRET),"\"v1\"",200).get("replayed").asBoolean());
        assertEquals(receiptCount,db.getCollection("career_command_idempotency").countDocuments()); assertEquals(outboxCount,db.getCollection("outbox_events").countDocuments());
        assertEquals(2L,db.getCollection("career_records").find(new Document("_id",rid)).first().getLong("version"));
    }
    @Test void cleanupCannotAdoptAUserEditedRecordVersionEvenWithValidDirectCredentials() throws Exception {
        var rid=createRecord();
        db.getCollection("career_records").updateOne(new Document("_id",rid),new Document("$set",new Document("origin","interview").append("bodyMd","document owner sentinel").append("documentVersion",7L)));
        var intent=intent("interview",patchBusiness(rid,2,new Document("title","old answer cleanup"),new Document("status","organized"))); source(intent);
        db.getCollection("interview_career_operations").updateOne(new Document("_id",SOURCE),new Document("$set",new Document("kind","cleanup")));
        db.getCollection("answers").updateOne(new Document("_id",ANSWER),new Document("$set",new Document("writerPending",false).append("recordVersion",1L)));
        // Answer가 묶은 v1 이후 실제 사용자 writer로 v2를 만든 뒤 owner를 직접 호출합니다.
        var edit=mvc.perform(patch("/v1/career/records/"+rid).header("Authorization","Bearer "+TOKEN).header("If-Match","\"v1\"").contentType("application/json").content("{\"title\":\"user edited title\"}")).andReturn().getResponse();
        assertEquals(200,edit.getStatus(),edit.getContentAsString());
        var collections=List.of("career_records","career_record_relations","career_command_idempotency","outbox_events","interview_career_operations","answers","questions","interview_sessions","users");
        var before=new LinkedHashMap<String,List<Document>>();
        for(var name:collections) before.put(name,db.getCollection(name).find().into(new ArrayList<>()));
        JsonNode response;
        // Node producer를 거치지 않고 실제 Spring HTTP 경계에 정상 service credential로 보냅니다.
        try(var http=HttpClient.newHttpClient()) {
            var request=HttpRequest.newBuilder(URI.create("http://127.0.0.1:"+port+PATH)).timeout(Duration.ofSeconds(10))
                    .header("Authorization","Bearer "+token(intent,INTERVIEW_SECRET)).header("If-Match","\"v2\"")
                    .header("Content-Type","application/json").POST(HttpRequest.BodyPublishers.ofString(request(intent).toJson())).build();
            var result=http.send(request,HttpResponse.BodyHandlers.ofString());
            assertEquals(412,result.statusCode(),result.body()); response=JSON.readTree(result.body());
        }
        assertEquals("PRECONDITION_FAILED",response.get("error").get("code").asText());
        assertEquals("VERSION_MISMATCH",response.get("error").get("message").asText());
        var record=db.getCollection("career_records").find(new Document("_id",rid)).first();
        assertEquals("user edited title",record.getString("title")); assertEquals("draft",record.getString("status")); assertEquals(2L,record.getLong("version"));
        for(var name:collections) assertEquals(before.get(name),db.getCollection(name).find().into(new ArrayList<>()),name+" must roll back completely");
    }
    @Test void oldProposalReceiptReplaysFromImmutableHistoryAndPurgedSourceCannotReplay() throws Exception {
        var rid=createRecord(); var intent=intent("ai-proposal",patchBusiness(rid,1,new Document("title","first"))); source(intent); call(intent,token(intent,AI_SECRET),"\"v1\"",200);
        var stored=db.getCollection("career_ai_proposals").find(new Document("_id",SOURCE)).first().get("writerIntegration",Document.class);
        var next=new Document(stored); next.put("operationId",id(99)); next.put("state","pending"); next.put("businessResult",null);
        db.getCollection("career_ai_proposals").updateOne(new Document("_id",SOURCE),new Document("$set",new Document("writerIntegrationHistory",List.of(stored)).append("writerIntegration",next)));
        assertTrue(call(intent,token(intent,AI_SECRET),"\"v1\"",200).get("replayed").asBoolean());
        db.getCollection("career_ai_proposals").deleteOne(new Document("_id",SOURCE)); call(intent,token(intent,AI_SECRET),"\"v1\"",404);
    }
    @Test void actualHttpAcceptsNodeHmacAndCanonicalScopeFingerprint() throws Exception {
        var rid=createRecord(); var intent=intent("ai-proposal",patchBusiness(rid,1,new Document("title","node-http")));
        var attrs=new Document("a",-0.0).append("A",0.5).append("10",1e23).append("2",1e-7).append("한글",1e-6);
        var document=new Document("kind","commands").append("recordId",rid).append("expectedVersion",0).append("allowedBlockIds",List.of(id(85))).append("summary","mixed document").append("commands",List.of(new Document("type","replaceBlock").append("blockId",id(85)).append("block",new Document("id",id(85)).append("type","paragraph").append("attrs",attrs))));
        intent.put("document",document); var binding=new Document(); for(var field:List.of("producer","userId","sourceId","operationId","business","document")) binding.put(field,intent.get(field));
        intent.put("fingerprint",HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(JSON.writeValueAsBytes(canonical(binding))))); source(intent);
        var root=Path.of(System.getProperty("b1RepositoryRoot")); var payload=new Document("request",request(intent)).append("business",intent.get("business")).append("document",intent.get("document")).append("expiresAt",Instant.now().plusSeconds(60).toString());
        var process=new ProcessBuilder(System.getenv().getOrDefault("B1_TEST_NODE","node"),root.resolve("services/backend-spring/src/test/producer-http-probe.mjs").toString(),"http://127.0.0.1:"+port,AI_SECRET,Base64.getEncoder().encodeToString(payload.toJson().getBytes(StandardCharsets.UTF_8))).start();
        var stdout=new String(process.getInputStream().readAllBytes(),StandardCharsets.UTF_8); var stderr=new String(process.getErrorStream().readAllBytes(),StandardCharsets.UTF_8); assertEquals(0,process.waitFor(),stderr);
        var response=JSON.readTree(stdout); assertEquals(200,response.get("status").asInt()); assertEquals("node-http",response.get("body").get("data").get("title").asText()); assertEquals("\"v2\"",response.get("etag").asText()); assertFalse(response.get("body").get("replayed").asBoolean());
    }
    @Test void preparedNodeProducersExecuteAcrossRealSpringHttpAndPreservePartialReceipts() throws Exception {
        var root=Path.of(System.getProperty("b1RepositoryRoot"));
        var process=new ProcessBuilder(System.getenv().getOrDefault("B1_TEST_NODE","node"),root.resolve("services/backend/test/support/prepared-producer-spring.mjs").toString(),System.getenv("B1_TEST_MONGO_URL"),DB,"http://127.0.0.1:"+port,AI_SECRET,INTERVIEW_SECRET).directory(root.resolve("services/backend").toFile()).redirectErrorStream(true).start();
        var output=new String(process.getInputStream().readAllBytes(),StandardCharsets.UTF_8); assertEquals(0,process.waitFor(),output);
        var response=JSON.readTree(output.trim()); assertEquals(3,response.get("ai").size()); assertEquals(5,response.get("receipts").asInt());
        for(var result:response.get("ai")) {
            assertEquals("completed",result.get("state").asText()); var record=db.getCollection("career_records").find(new Document("_id",result.get("recordId").asText()).append("userId",response.get("userId").asText())).first(); assertNotNull(record);
            assertEquals(result.get("version").asLong(),record.get("version",Number.class).longValue()); assertEquals(result.get("documentVersion").asLong(),record.get("documentVersion",Number.class).longValue());
        }
        var interview=response.get("interview"); assertEquals("completed",interview.get("state").asText()); var record=db.getCollection("career_records").find(new Document("_id",interview.get("recordId").asText())).first();
        assertEquals("interview",record.getString("origin")); assertEquals("organized",record.getString("status")); assertEquals("",record.getString("bodyMd")); assertEquals(4L,record.get("version",Number.class).longValue()); assertEquals(2L,record.get("documentVersion",Number.class).longValue());
    }
    @Test void failingReceiptRollsBackBusinessOutboxAndSourceFence() throws Exception {
        var rid=createRecord(); var intent=intent("ai-proposal",patchBusiness(rid,1,new Document("propertyValues",new Document("set",List.of(new Document("propertyDefinitionId",PROPERTY).append("type","number").append("value","1"))).append("unsetPropertyIds",List.of())))); source(intent);
        var receiptValidator=db.listCollections().filter(new Document("name","career_command_idempotency")).first().get("options",Document.class).get("validator",Document.class);
        db.runCommand(new Document("collMod","career_command_idempotency").append("validator",new Document("$expr",new Document("$eq",List.of(1,0)))));
        try {call(intent,token(intent,AI_SECRET),"\"v1\"",500); assertEquals(1L,db.getCollection("career_records").find(new Document("_id",rid)).first().getLong("version")); assertEquals(0,db.getCollection("outbox_events").countDocuments()); var persisted=db.getCollection("career_ai_proposals").find(new Document("_id",SOURCE)).first().get("writerIntegration",Document.class); assertNull(persisted.get("businessResult")); assertEquals(1,((Number)persisted.get("fence")).intValue());}
        finally {db.runCommand(new Document("collMod","career_command_idempotency").append("validator",receiptValidator==null?new Document():receiptValidator));}
    }

    @Test void activeSchemaMutationBlocksAiAndRollsBackIntentFenceReceiptAndBusinessWrite() throws Exception {
        var rid=createRecord();var intent=intent("ai-proposal",patchBusiness(rid,1,new Document("title","blocked")));source(intent);
        db.getCollection("career_property_mutations").insertOne(CareerWriterMongoIntegrationTest.mutationLockJob(USER,CATEGORY,rid,"pending"));
        var error=call(intent,token(intent,AI_SECRET),"\"v1\"",409).get("error");assertEquals("CAREER_PROPERTY_MUTATION_ACTIVE",error.get("message").asText());assertEquals(CareerWriterMongoIntegrationTest.id(300),error.get("details").get("mutationId").asText());assertFalse(error.toString().contains(USER));
        assertEquals("",db.getCollection("career_records").find(new Document("_id",rid)).first().getString("title"));assertEquals(1L,db.getCollection("career_records").find(new Document("_id",rid)).first().getLong("version"));assertEquals(0,db.getCollection("career_command_idempotency").countDocuments());assertEquals(0,db.getCollection("outbox_events").countDocuments());
        var stored=db.getCollection("career_ai_proposals").find().first().get("writerIntegration",Document.class);assertNull(stored.get("businessResult"));assertEquals(1,((Number)stored.get("fence")).intValue());
    }
    @Test void failedSchemaMutationBlocksInterviewBusinessCreateAndPreservesPendingAnswer() throws Exception {
        var intent=intent("interview",new Document("kind","create").append("expectedCategoryVersion",1).append("input",new Document("categoryId",CATEGORY)));source(intent);
        db.getCollection("career_property_mutations").insertOne(CareerWriterMongoIntegrationTest.mutationLockJob(USER,CATEGORY,SOURCE,"failed"));
        var error=call(intent,token(intent,INTERVIEW_SECRET),null,409).get("error");assertEquals("failed",error.get("details").get("status").asText());assertTrue(error.get("details").get("retryable").asBoolean());
        assertEquals(0,db.getCollection("career_records").countDocuments());assertEquals(0,db.getCollection("career_command_idempotency").countDocuments());assertEquals(0,db.getCollection("outbox_events").countDocuments());
        assertTrue(db.getCollection("answers").find().first().getBoolean("writerPending"));assertNull(db.getCollection("interview_career_operations").find().first().get("writerIntegration",Document.class).get("businessResult"));
    }
    void producerPrivateOptions() {
        var definition=CareerWriterMongoIntegrationTest.def(PROPERTY,"tags","multi_select",new Document("legacyFreeformTags",true).append("options",List.of(new Document("id",id(81)).append("label","common"))));
        db.getCollection("career_categories").updateOne(new Document(),new Document("$set",new Document("propertySchemaV2",List.of(definition))));
        db.getCollection("career_property_options").insertMany(List.of(CareerWriterMongoIntegrationTest.privateOption(USER,CATEGORY,PROPERTY,id(401)," Own "),CareerWriterMongoIntegrationTest.privateOption(id(97),CATEGORY,PROPERTY,id(403),"foreign"),CareerWriterMongoIntegrationTest.privateOption(USER,CATEGORY,id(98),id(404),"wrong property")));
    }
    JsonNode privateOptionHttp(Document intent,String match,int status) throws Exception {
        var secret=intent.getString("producer").equals("ai-proposal")?AI_SECRET:INTERVIEW_SECRET;
        try(var http=HttpClient.newHttpClient()) {
            var builder=HttpRequest.newBuilder(URI.create("http://127.0.0.1:"+port+PATH)).timeout(Duration.ofSeconds(10)).header("Authorization","Bearer "+token(intent,secret)).header("Content-Type","application/json");
            if(match!=null)builder.header("If-Match",match);
            var response=http.send(builder.POST(HttpRequest.BodyPublishers.ofString(request(intent).toJson())).build(),HttpResponse.BodyHandlers.ofString());assertEquals(status,response.statusCode(),response.body());return JSON.readTree(response.body());
        }
    }
    @Test void actualAiHttpUsesRecordOwnerPrivateOptionsAndRejectsForeignOrWrongPropertyIdsAtomically() throws Exception {
        for(var option:List.of(id(403),id(404),id(401))) {
            seed();producerPrivateOptions();var rid=createRecord();var value=new Document("propertyDefinitionId",PROPERTY).append("type","multi_select").append("value",List.of(option));
            var intent=intent("ai-proposal",patchBusiness(rid,1,new Document("propertyValues",new Document("set",List.of(value)).append("unsetPropertyIds",List.of()))));source(intent);
            var own=option.equals(id(401));var response=privateOptionHttp(intent,"\"v1\"",own?200:400);
            if(own)assertEquals(option,response.get("data").get("propertyValues").get(0).get("value").get(0).asText());
            else {assertEquals(1L,db.getCollection("career_records").find().first().getLong("version"));assertEquals(0,db.getCollection("career_command_idempotency").countDocuments());assertEquals(0,db.getCollection("outbox_events").countDocuments());var integration=db.getCollection("career_ai_proposals").find().first().get("writerIntegration",Document.class);assertNull(integration.get("businessResult"));assertEquals(1,((Number)integration.get("fence")).intValue());}
        }
    }
    @Test void actualInterviewHttpCreatesUsingAuthenticatedSourceOwnerOptionsOnly() throws Exception {
        for(var option:List.of(id(403),id(401))) {
            seed();producerPrivateOptions();var value=new Document("propertyDefinitionId",PROPERTY).append("type","multi_select").append("value",List.of(option));
            var intent=intent("interview",new Document("kind","create").append("expectedCategoryVersion",1).append("input",new Document("categoryId",CATEGORY).append("propertyValues",List.of(value))));source(intent);
            var own=option.equals(id(401));var response=privateOptionHttp(intent,null,own?200:400);
            if(own) {assertEquals(USER,response.get("data").get("userId").asText());assertEquals(option,response.get("data").get("propertyValues").get(0).get("value").get(0).asText());}
            else {assertEquals(0,db.getCollection("career_records").countDocuments());assertEquals(0,db.getCollection("career_command_idempotency").countDocuments());assertEquals(0,db.getCollection("outbox_events").countDocuments());assertTrue(db.getCollection("answers").find().first().getBoolean("writerPending"));assertNull(db.getCollection("interview_career_operations").find().first().get("writerIntegration",Document.class).get("businessResult"));}
        }
    }
    Document productIntent(Document business) throws Exception {
        var intent=intent("career-product",business);intent.put("sourceId",OP);var bound=new Document();for(var key:List.of("producer","userId","sourceId","operationId","business","document"))bound.put(key,intent.get(key));intent.put("fingerprint",HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(JSON.writeValueAsBytes(canonical(bound)))));return intent;
    }
    Document productSource(Document intent) {
        var business=intent.get("business",Document.class);var row=new Document("_id",OP).append("userId",USER).append("inputIdempotencyKey",id(786)).append("inputHash","a".repeat(64)).append("requestHash",intent.getString("fingerprint")).append("kind",business.getString("kind")).append("recordId",business.getString("recordId")).append("writerIntegration",intent).append("active",true).append("result",null).append("createdAt",new Date()).append("updatedAt",new Date());db.getCollection("career_product_operations").insertOne(row);return row;
    }
    @Test void productServiceCreatesOwnedRecordAndReplaysUnknownHttpResponseWithoutSessionToken() throws Exception {
        db.getCollection("identity_sessions").deleteMany(new Document());var intent=productIntent(new Document("kind","create").append("expectedCategoryVersion",1).append("input",new Document("categoryId",CATEGORY).append("title","product create").append("propertyValues",List.of(new Document("propertyDefinitionId",PROPERTY).append("type","number").append("value","7.1200")))));productSource(intent);
        var http=HttpClient.newHttpClient();var req=HttpRequest.newBuilder(URI.create("http://127.0.0.1:"+port+PATH)).header("Authorization","Bearer "+token(intent,CareerProductProducerAuthenticationTest.SECRET)).header("Content-Type","application/json").POST(HttpRequest.BodyPublishers.ofString(request(intent).toJson())).build();assertEquals(200,http.send(req,HttpResponse.BodyHandlers.discarding()).statusCode());
        db.getCollection("career_product_operations").updateOne(new Document("_id",OP),new Document("$set",new Document("active",false).append("writerIntegration.state","completed").append("writerIntegration.leaseUntil",Instant.EPOCH.toString())));
        var recovered=call(intent,token(intent,CareerProductProducerAuthenticationTest.SECRET),null,200);assertTrue(recovered.get("replayed").asBoolean());assertEquals(1,recovered.get("data").get("version").asLong());assertEquals("product create",recovered.get("data").get("title").asText());assertEquals(1,db.getCollection("career_records").countDocuments());assertEquals(1,db.getCollection("career_command_idempotency").countDocuments());assertEquals(1,db.getCollection("outbox_events").countDocuments());var record=db.getCollection("career_records").find().first();assertEquals(USER,record.getString("userId"));assertEquals("manual",record.getString("origin"));assertEquals("",record.getString("bodyMd"));assertFalse(db.getCollection("career_product_operations").find().first().toJson().contains(TOKEN));
    }
    @Test void productCombinedPatchUsesOneCasVersionOutboxAndPreservesDocumentOwnerFields() throws Exception {
        var rid=createRecord();db.getCollection("career_records").updateOne(new Document("_id",rid),new Document("$set",new Document("bodyMd","document owner body").append("documentVersion",7L).append("latestSnapshotId",id(777)).append("blockBody",List.of(new Document("opaque",true)))));var before=db.getCollection("career_records").find(new Document("_id",rid)).first();db.getCollection("outbox_events").deleteMany(new Document());
        var patch=new Document("title","combined product").append("status","verified").append("propertyValues",new Document("set",List.of(new Document("propertyDefinitionId",PROPERTY).append("type","number").append("value","9.1200"))).append("unsetPropertyIds",List.of()));var intent=productIntent(patchBusiness(rid,1,patch));productSource(intent);
        var result=call(intent,token(intent,CareerProductProducerAuthenticationTest.SECRET),"\"v1\"",200);assertEquals(2,result.get("data").get("version").asLong());assertEquals("verified",result.get("data").get("status").asText());assertEquals(1,db.getCollection("outbox_events").countDocuments());var after=db.getCollection("career_records").find(new Document("_id",rid)).first();for(var key:List.of("bodyMd","blockBody","documentVersion","latestSnapshotId"))assertEquals(before.get(key),after.get(key));
        db.getCollection("career_product_operations").updateOne(new Document("_id",OP),new Document("$set",new Document("active",false).append("writerIntegration.state","blocked").append("writerIntegration.lastError","OWNER_CONFLICT")));assertTrue(call(intent,token(intent,CareerProductProducerAuthenticationTest.SECRET),"\"v1\"",200).get("replayed").asBoolean());assertEquals(1,db.getCollection("outbox_events").countDocuments());
    }
    @Test void productFrozenSourceTamperAndMultiplePatchesCannotPartiallyWrite() throws Exception {
        var rid=createRecord();db.getCollection("outbox_events").deleteMany(new Document());var intent=productIntent(patchBusiness(rid,1,new Document("title","blocked")));var original=productSource(intent);var before=db.getCollection("career_records").find(new Document("_id",rid)).first();
        for(var field:List.of("kind","recordId","requestHash")) {
            Object value=switch(field){case "kind"->"create";case "recordId"->id(778);default->"b".repeat(64);};assertThrows(com.mongodb.MongoWriteException.class,()->db.getCollection("career_product_operations").updateOne(new Document("_id",OP),new Document("$set",new Document(field,value))));assertEquals(original,db.getCollection("career_product_operations").find().first());assertEquals(before,db.getCollection("career_records").find(new Document("_id",rid)).first());
        }
        for(var tamper:List.of(new Document("active",false),new Document("writerIntegration.business.patches.0.title","changed after freeze"))) {
            db.getCollection("career_product_operations").updateOne(new Document("_id",OP),new Document("$set",tamper));call(intent,token(intent,CareerProductProducerAuthenticationTest.SECRET),"\"v1\"",409);assertEquals(before,db.getCollection("career_records").find(new Document("_id",rid)).first());db.getCollection("career_product_operations").replaceOne(new Document("_id",OP),original);
        }
        db.getCollection("career_product_operations").deleteMany(new Document());var multiple=productIntent(patchBusiness(rid,1,new Document("title","first"),new Document("status","verified")));productSource(multiple);call(multiple,token(multiple,CareerProductProducerAuthenticationTest.SECRET),"\"v1\"",400);assertEquals(before,db.getCollection("career_records").find(new Document("_id",rid)).first());assertEquals(0,db.getCollection("career_command_idempotency").countDocuments());assertEquals(0,db.getCollection("outbox_events").countDocuments());
    }
    @Test void productCrossUserSourceRecordAndForeignCategoryAreRejectedWhileSharedSystemCreateIsAllowed() throws Exception {
        var rid=createRecord();var intent=productIntent(patchBusiness(rid,1,new Document("title","foreign")));var original=productSource(intent);assertThrows(com.mongodb.MongoWriteException.class,()->db.getCollection("career_product_operations").updateOne(new Document("_id",OP),new Document("$set",new Document("userId",id(880)))));var foreignIntent=Document.parse(intent.toJson()).append("userId",id(880));var binding=new Document();for(var key:List.of("producer","userId","sourceId","operationId","business","document"))binding.put(key,foreignIntent.get(key));foreignIntent.put("fingerprint",HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(JSON.writeValueAsBytes(canonical(binding)))));var foreignSource=Document.parse(original.toJson()).append("userId",id(880)).append("requestHash",foreignIntent.getString("fingerprint")).append("writerIntegration",foreignIntent);db.getCollection("career_product_operations").replaceOne(new Document("_id",OP),foreignSource);call(intent,token(intent,CareerProductProducerAuthenticationTest.SECRET),"\"v1\"",404);db.getCollection("career_product_operations").replaceOne(new Document("_id",OP),original);db.getCollection("career_records").updateOne(new Document("_id",rid),new Document("$set",new Document("userId",id(880))));call(intent,token(intent,CareerProductProducerAuthenticationTest.SECRET),"\"v1\"",404);
        db.getCollection("career_product_operations").deleteMany(new Document());var create=productIntent(new Document("kind","create").append("expectedCategoryVersion",1).append("input",new Document("categoryId",CATEGORY)));productSource(create);db.getCollection("career_categories").updateOne(new Document("_id",CATEGORY),new Document("$set",new Document("userId",id(880))));call(create,token(create,CareerProductProducerAuthenticationTest.SECRET),null,404);db.getCollection("career_categories").updateOne(new Document("_id",CATEGORY),new Document("$set",new Document("userId",null).append("isSystem",true)));var result=call(create,token(create,CareerProductProducerAuthenticationTest.SECRET),null,200);assertEquals(USER,result.get("data").get("userId").asText());assertEquals(1,result.get("data").get("version").asLong());
    }
    @Test void actualNodeProductTypedHttpRecoversLostResponseAndNeverUsesUserSession() throws Exception {
        var intent=productIntent(new Document("kind","create").append("expectedCategoryVersion",1).append("input",new Document("categoryId",CATEGORY).append("title","Node product").append("propertyValues",List.of(new Document("propertyDefinitionId",PROPERTY).append("type","number").append("value","7.1200")))));productSource(intent);db.getCollection("identity_sessions").deleteMany(new Document());
        var root=Path.of(System.getProperty("b1RepositoryRoot"));var script="""
            import assert from 'node:assert/strict';import {MongoClient} from 'mongodb';
            import {createCareerProducerCredential,createSpringCareerProducerPort} from './src/modules/career/spring-producer-port.ts';
            const client=new MongoClient(process.env.B2_TEST_MONGO_URL),db=client.db(process.env.B2_TEST_DATABASE);await client.connect();
            try{let lost=true;const port=createSpringCareerProducerPort({client,db},process.env.B2_TEST_ENDPOINT,scope=>createCareerProducerCredential(scope,Buffer.from('disposable-product-secret-at-least-32-bytes')),async(url,init)=>{const result=await fetch(url,init);if(lost&&result.ok){lost=false;throw new Error('simulated lost response');}return result;});const command=JSON.parse(process.env.B2_TEST_COMMAND);await assert.rejects(port.commit(command),error=>error.statusCode===503);await db.collection('career_product_operations').updateOne({_id:command.sourceId},{$set:{active:false,'writerIntegration.state':'completed','writerIntegration.leaseUntil':new Date(0).toISOString()}});const replay=await port.commit(command);assert.equal(replay.replayed,true);assert.equal(replay.data.title,'Node product');assert.equal(replay.data.version,1);console.log('typed product HTTP replay verified');}finally{await client.close();}
            """;
        var builder=new ProcessBuilder(System.getenv().getOrDefault("B1_TEST_NODE","node"),"--import","tsx","--input-type=module").directory(root.resolve("services/backend").toFile()).redirectErrorStream(true);builder.environment().put("B2_TEST_COMMAND",request(intent).toJson());builder.environment().put("B2_TEST_MONGO_URL",System.getenv("B1_TEST_MONGO_URL"));builder.environment().put("B2_TEST_DATABASE",DB);builder.environment().put("B2_TEST_ENDPOINT","http://127.0.0.1:"+port);var process=builder.start();process.getOutputStream().write(script.getBytes(StandardCharsets.UTF_8));process.getOutputStream().close();var output=new String(process.getInputStream().readAllBytes(),StandardCharsets.UTF_8);assertEquals(0,process.waitFor(),output);assertEquals(1,db.getCollection("career_records").countDocuments());assertEquals(1,db.getCollection("career_command_idempotency").countDocuments());assertEquals(1,db.getCollection("outbox_events").countDocuments());
    }
    @Test void productCreateOutboxFailureRollsBackRecordReceiptAndFrozenSourceThenRetries() throws Exception {
        var intent=productIntent(new Document("kind","create").append("expectedCategoryVersion",1).append("input",new Document("categoryId",CATEGORY).append("title","").append("propertyValues",List.of(new Document("propertyDefinitionId",PROPERTY).append("type","number").append("value","7.1200")))));var before=productSource(intent);var validator=db.listCollections().filter(new Document("name","outbox_events")).first().get("options",Document.class).get("validator",Document.class);
        db.runCommand(new Document("collMod","outbox_events").append("validator",new Document("$expr",new Document("$eq",List.of(1,0)))));
        try{call(intent,token(intent,CareerProductProducerAuthenticationTest.SECRET),null,500);assertEquals(before,db.getCollection("career_product_operations").find().first());assertEquals(0,db.getCollection("career_records").countDocuments());assertEquals(0,db.getCollection("career_command_idempotency").countDocuments());assertEquals(0,db.getCollection("outbox_events").countDocuments());}finally{db.runCommand(new Document("collMod","outbox_events").append("validator",validator==null?new Document():validator));}
        call(intent,token(intent,CareerProductProducerAuthenticationTest.SECRET),null,200);assertEquals(1,db.getCollection("career_records").countDocuments());assertEquals(1,db.getCollection("career_command_idempotency").countDocuments());assertEquals(1,db.getCollection("outbox_events").countDocuments());
    }
    @Test void productInitialRelationsFreezeOnlySourceCategoryVersionAndFenceCurrentTargetSchema() throws Exception {
        var relation=id(791);var inverse=id(792);var targetCategory=id(793);var config=new Document("targetCategoryId",targetCategory).append("inversePropertyId",inverse).append("cardinality","multiple").append("deletePolicy","nullify");var sourceDefinition=CareerWriterMongoIntegrationTest.def(relation,"initial_rel","relation",config);var definitions=new ArrayList<>(db.getCollection("career_categories").find(new Document("_id",CATEGORY)).first().getList("propertySchemaV2",Document.class));definitions.add(sourceDefinition);db.getCollection("career_categories").updateOne(new Document("_id",CATEGORY),new Document("$set",new Document("propertySchemaV2",definitions)));
        var target=new Document(db.getCollection("career_categories").find(new Document("_id",CATEGORY)).first()).append("_id",targetCategory).append("key","target_initial").append("propertySchemaV2",List.of(CareerWriterMongoIntegrationTest.def(inverse,"inverse","relation",new Document("targetCategoryId",CATEGORY).append("inversePropertyId",relation).append("cardinality","multiple").append("deletePolicy","nullify")))).append("version",2L).append("schemaVersion",2L);db.getCollection("career_categories").insertOne(target);
        var response=mvc.perform(post("/v1/career/records").header("Authorization","Bearer "+TOKEN).header("Idempotency-Key","product-initial-target-key").contentType("application/json").content(new Document("categoryId",targetCategory).toJson())).andReturn().getResponse();assertEquals(201,response.getStatus(),response.getContentAsString());var targetId=JSON.readTree(response.getContentAsString()).get("data").get("id").asText();db.getCollection("outbox_events").deleteMany(new Document());db.getCollection("career_command_idempotency").deleteMany(new Document());
        var intent=productIntent(new Document("kind","create").append("expectedCategoryVersion",1).append("input",new Document("categoryId",CATEGORY).append("initialRelations",List.of(new Document("propertyId",relation).append("targetIds",List.of(targetId))))));productSource(intent);var result=call(intent,token(intent,CareerProductProducerAuthenticationTest.SECRET),null,200);assertEquals(1,result.get("data").get("version").asLong());assertEquals(2,db.getCollection("career_record_relations").countDocuments());assertEquals(2,db.getCollection("outbox_events").countDocuments());assertEquals(1L,db.getCollection("career_records").find(new Document("_id",targetId)).first().getLong("version"));
    }
    @Test void actualNodeAiProductRouteRecoversExactBusinessAndMixedOwnersAfterSessionLoss() throws Exception {
        for(var mixed:List.of(false,true)) {
            seed();var plan=db.getCollection("plans").find(new Document("code","free")).first();assertNotNull(plan);db.getCollection("users").updateOne(new Document("_id",USER),new Document("$set",new Document("planId",plan.getString("_id"))));var rid=createRecord();db.getCollection("career_records").updateOne(new Document("_id",rid),new Document("$set",new Document("bodyMd","Original body").append("propertyValues",List.of(new Document("propertyDefinitionId",PROPERTY).append("type","number").append("value",org.bson.types.Decimal128.parse("12345678901234567890.123400"))))));db.getCollection("outbox_events").deleteMany(new Document());
            var script="""
                import assert from 'node:assert/strict';import Fastify from 'fastify';import {MongoClient} from 'mongodb';
                import {CareerProducerCoordinator,createSpringCareerProducerPort,createCareerProducerCredential,CanonicalCareerReadService} from './src/modules/career/index.ts';
                import {MongoIdentityService} from './src/modules/identity/index.ts';import {CareerDocumentService} from './src/modules/career-editor/service.ts';import {PreparedCareerDocumentWriter} from './src/modules/career-editor/prepared-document-writer.ts';import {ProductAiProposalIntegration} from './src/modules/career-editor/product-ai-integration.ts';import {registerCareerDocumentRoutes} from './src/modules/career-editor/routes.ts';
                const client=new MongoClient(process.env.B2_TEST_MONGO_URL),db=client.db(process.env.B2_TEST_DATABASE);await client.connect();const context={client,db},user=process.env.B2_TEST_USER,recordId=process.env.B2_TEST_RECORD,property=process.env.B2_TEST_PROPERTY,mixed=process.env.B2_TEST_MIXED==='true';
                const previous={propertyDefinitionId:property,type:'number',value:'12345678901234567890.123400'},next={...previous,value:'12345678901234567890.123500'};
                const documents=new CareerDocumentService(context,'disposable-product-document-test',undefined,undefined,{async generate(input){assert.deepEqual(input.canonicalPropertyValues,[previous]);return{summary:'Exact AI proposal',commands:mixed?[{type:'setText',blockId:input.selectionBlockIds[0],text:'AI body'}]:[],propertyChanges:[{propertyId:property,canonicalPreviousValue:previous,canonicalNextValue:next}]};}});
                let lost=true;const business=createSpringCareerProducerPort(context,process.env.B2_TEST_ENDPOINT,scope=>createCareerProducerCredential(scope,Buffer.from('disposable-ai-secret-at-least-32-bytes')),async(url,init)=>{const result=await fetch(url,init);if(lost&&result.ok){lost=false;throw new Error('simulated owner response loss');}return result;});const integration=new ProductAiProposalIntegration(context,documents,new CareerProducerCoordinator(context,business,new PreparedCareerDocumentWriter(context)),new CanonicalCareerReadService(context));documents.setProductAiIntegration(integration);
                const app=Fastify();app.decorateRequest('auth',null);registerCareerDocumentRoutes(app,{service:documents,authenticateRequest:async(request)=>{request.auth=await new MongoIdentityService(context).verifyAccessToken(request.headers.authorization?.slice(7));if(!request.auth)throw Object.assign(new Error('unauthenticated'),{statusCode:401});}});
                try{const bootstrap=await documents.bootstrap(user,recordId),proposal=await documents.createAiProposal(user,recordId,{selection:{blockIds:[bootstrap.document.content[0].id]},prompt:'Exact numbers'});const input={expectedDocumentVersion:0,commandIndexes:mixed?[0]:[],propertyChangeIndexes:[0]};const result=await app.inject({method:'POST',url:`/v1/career/records/${recordId}/ai-proposals/${proposal.proposalId}/apply`,headers:{authorization:'Bearer '+process.env.B2_TEST_SESSION},payload:input});assert.equal(result.statusCode,202,result.body);const operation=result.json().data;assert.equal(operation.owners.business,'completed');assert.equal(operation.owners.document,mixed?'pending':'not-required');assert.equal(result.headers.location,operation.statusUrl);const source=await db.collection('career_ai_proposals').findOne({_id:proposal.proposalId});assert.equal(JSON.stringify(source).includes(process.env.B2_TEST_SESSION),false);await db.collection('identity_sessions').deleteMany({userId:user});await integration.execute(source.writerIntegration);const detail=await documents.getAiProposal(user,recordId,proposal.proposalId);assert.equal(detail.status,'applied');assert.equal(detail.businessChangesRetained,true);const stored=await db.collection('career_records').findOne({_id:recordId});assert.equal(stored.version,2);assert.equal(stored.propertyValues[0].value.toString(),next.value);const undo=await documents.undoAiProposalOperation(user,recordId,{recordId,proposalId:proposal.proposalId,expectedDocumentVersion:mixed?1:0});assert.equal(undo.status,200);if(mixed){assert.equal(undo.body.documentVersion,2);assert.equal(undo.body.document.content[0].text[0].text,'Original body');}else assert.deepEqual(undo.body,{data:{outcome:'no-document-target',scope:'none',businessChangesRetained:true}});assert.equal((await db.collection('career_records').findOne({_id:recordId})).version,2);assert.equal(await db.collection('career_command_idempotency').countDocuments(),1);assert.equal(await db.collection('outbox_events').countDocuments(),1);console.log('actual AI product route and scoped Spring owner recovery verified');}finally{await app.close();await client.close();}
                """;
            var builder=new ProcessBuilder(System.getenv().getOrDefault("B1_TEST_NODE","node"),"--import","tsx","--input-type=module").directory(Path.of(System.getProperty("b1RepositoryRoot")).resolve("services/backend").toFile()).redirectErrorStream(true);builder.environment().put("B2_TEST_MONGO_URL",System.getenv("B1_TEST_MONGO_URL"));builder.environment().put("B2_TEST_DATABASE",DB);builder.environment().put("B2_TEST_ENDPOINT","http://127.0.0.1:"+port);builder.environment().put("B2_TEST_USER",USER);builder.environment().put("B2_TEST_RECORD",rid);builder.environment().put("B2_TEST_PROPERTY",PROPERTY);builder.environment().put("B2_TEST_MIXED",mixed.toString());builder.environment().put("B2_TEST_SESSION",TOKEN);var process=builder.start();process.getOutputStream().write(script.getBytes(StandardCharsets.UTF_8));process.getOutputStream().close();var output=new String(process.getInputStream().readAllBytes(),StandardCharsets.UTF_8);assertEquals(0,process.waitFor(),output);assertEquals(1,db.getCollection("career_command_idempotency").countDocuments());assertEquals(1,db.getCollection("outbox_events").countDocuments());
        }
    }
    @Test void actualAuthenticatedFastifyProductRuntimeOwnsCompleteWritesAndRecovery() throws Exception {
        var root=Path.of(System.getProperty("b1RepositoryRoot"));
        var builder=new ProcessBuilder(System.getenv().getOrDefault("B1_TEST_NODE","node"),"--import","tsx",root.resolve("services/backend/test/support/b2-product-spring-probe.mjs").toString()).directory(root.resolve("services/backend").toFile()).redirectErrorStream(true);
        builder.environment().put("B2_TEST_MONGO_URL",System.getenv("B1_TEST_MONGO_URL"));
        builder.environment().put("B2_TEST_DATABASE",DB);
        builder.environment().put("B2_TEST_ENDPOINT","http://127.0.0.1:"+port);
        var process=builder.start();
        var output=new String(process.getInputStream().readAllBytes(),StandardCharsets.UTF_8);
        assertEquals(0,process.waitFor(),output);
        assertTrue(output.contains("\"verified\":9"),output);
    }
}

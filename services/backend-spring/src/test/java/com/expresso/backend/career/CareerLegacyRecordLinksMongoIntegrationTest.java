package com.expresso.backend.career;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import java.nio.file.Path;
import java.time.*;
import java.util.*;
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
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import com.expresso.backend.career.application.*;
import com.expresso.backend.career.infrastructure.mongo.MongoCareerCommandRepository;

@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT,properties={"career.writer.enabled=true","spring.main.web-application-type=servlet","career.writer.move-secret=disposable-link-test-secret-at-least-32-bytes"})
@AutoConfigureMockMvc
@EnabledIfEnvironmentVariable(named="B1_TEST_MONGO_URL",matches=".+")
class CareerLegacyRecordLinksMongoIntegrationTest {
    static final String DB="expresso_test_b1_java_"+UUID.randomUUID().toString().replace("-","");
    static final String USER=id(2),OTHER=id(4),CATEGORY=id(3),TARGET_CATEGORY=id(5),FOREIGN_CATEGORY=id(6),SOURCE=id(101),TARGET=id(102),FOREIGN=id(103),CORRUPT=id(104);
    static final String TOKEN="exps_"+"A".repeat(43),TOKEN2="exps_"+"B".repeat(43),BASE="/v1/career/records/";
    static final JsonMapper JSON=JsonMapper.builder().build();
    static MongoClient client;static MongoDatabase db;
    @Autowired MockMvc mvc;
    @Autowired MongoCareerCommandRepository repository;
    @org.springframework.boot.test.web.server.LocalServerPort int port;
    @DynamicPropertySource static void properties(DynamicPropertyRegistry registry) {registry.add("career.writer.mongo-uri",()->System.getenv("B1_TEST_MONGO_URL"));registry.add("career.writer.database",()->DB);}
    @BeforeAll static void migrate() throws Exception {
        var root=Path.of(System.getProperty("b1RepositoryRoot"));var process=new ProcessBuilder(System.getenv().getOrDefault("B1_TEST_NODE","node"),root.resolve("services/backend-spring/src/test/migrate-test-database.mjs").toString(),System.getenv("B1_TEST_MONGO_URL"),DB).inheritIO().start();assertEquals(0,process.waitFor());
        client=MongoClients.create(System.getenv("B1_TEST_MONGO_URL"));db=client.getDatabase(DB);
    }
    @AfterAll static void cleanup() {if(client!=null)try{db.drop();}finally{client.close();}}
    static String id(int n) {return CareerWriterMongoIntegrationTest.id(n);}
    @BeforeEach void seed() {
        for(var name:List.of("users","identity_sessions","career_records","career_categories","record_links","career_property_mutations","career_property_options","outbox_events","career_command_idempotency"))db.getCollection(name).deleteMany(new Document());
        for(var user:List.of(USER,OTHER))db.getCollection("users").insertOne(new Document("_id",user).append("email",user+"@link.test").append("displayName","tester").append("planId",id(91)).append("createdAt",new Date()).append("deletionRequestedAt",null));
        session(USER,TOKEN);session(OTHER,TOKEN2);category(CATEGORY,USER);category(TARGET_CATEGORY,USER);category(FOREIGN_CATEGORY,OTHER);
        record(SOURCE,USER,CATEGORY);record(TARGET,USER,TARGET_CATEGORY);record(FOREIGN,OTHER,FOREIGN_CATEGORY);record(CORRUPT,USER,FOREIGN_CATEGORY);
    }
    static void session(String user,String token) {db.getCollection("identity_sessions").insertOne(new Document("_id",UUID.randomUUID().toString()).append("userId",user).append("tokenHash",CareerMoveTokens.hash(token)).append("expiresAt",Date.from(Instant.now().plusSeconds(3600))).append("createdAt",new Date()).append("revokedAt",null));}
    static void category(String category,String user) {db.getCollection("career_categories").insertOne(new Document("_id",category).append("userId",user).append("key","links"+category.substring(30)).append("name","links").append("icon","folder").append("defaultView","list").append("sortOrder",0).append("propertySchemaV2",List.of(CareerWriterMongoIntegrationTest.def(id(11),"name","text",new Document()))).append("version",1L).append("schemaVersion",1L).append("writeVersion",0L).append("updatedAt",new Date()));}
    static void record(String record,String user,String category) {db.getCollection("career_records").insertOne(new Document("_id",record).append("userId",user).append("categoryId",category).append("title","title").append("status","draft").append("origin","manual").append("version",1L).append("referenceVersion",0L).append("updatedAt",Date.from(Instant.EPOCH)).append("deletedAt",null).append("purgeAfter",null).append("properties",new Document("legacy","preserve")).append("propertyValues",List.of()).append("bodyMd","document owner").append("blockBody",List.of(new Document("opaque",true))).append("documentVersion",7L).append("latestSnapshotId",id(93)));}
    static Document stored(String record) {return db.getCollection("career_records").find(new Document("_id",record)).first();}
    static String body(String target,String relation) {return new Document("toRecordId",target).append("relation",relation).toJson();}
    JsonNode call(MockHttpServletRequestBuilder request,int status) throws Exception {var response=mvc.perform(request.header("Authorization","Bearer "+TOKEN).contentType("application/json")).andReturn().getResponse();assertEquals(status,response.getStatus(),response.getContentAsString());return JSON.readTree(response.getContentAsString());}
    JsonNode create(String source,String target,String relation) throws Exception {var response=mvc.perform(post(BASE+source+"/links").header("Authorization","Bearer "+TOKEN).header("If-Match","\"v1\"").contentType("application/json").content(body(target,relation))).andReturn().getResponse();assertEquals(201,response.getStatus(),response.getContentAsString());assertEquals("\"v1\"",response.getHeader("ETag"));return JSON.readTree(response.getContentAsString()).get("data");}
    @Test void actualHttpReturnsExistingLinkContractsAndPreservesEnumAndParentDirection() throws Exception {
        var script="""
            import assert from 'node:assert/strict';
            import { CareerRecordLinkSchema } from '@expresso/contracts';
            const base=process.env.LINK_BASE,token=process.env.LINK_TOKEN,source=process.env.LINK_SOURCE,target=process.env.LINK_TARGET;
            async function create(record,toRecordId,relation){const response=await fetch(`${base}/v1/career/records/${record}/links`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json','If-Match':'"v1"'},body:JSON.stringify({toRecordId,relation})});assert.equal(response.status,201,await response.clone().text());assert.equal(response.headers.get('etag'),'"v1"');return CareerRecordLinkSchema.parse((await response.json()).data);}
            const related=await create(source,target,'related');assert.equal(related.direction,'outgoing');
            const parent=await create(target,source,'parent');assert.equal(parent.direction,'outgoing');assert.equal(parent.recordId,target);
            await create(source,target,'duplicate_of');
            const response=await fetch(`${base}/v1/career/records/${source}/links`,{headers:{Authorization:`Bearer ${token}`}});assert.equal(response.status,200);const links=(await response.json()).data.map(value=>CareerRecordLinkSchema.parse(value));assert.equal(links.length,3);assert.equal(links.find(value=>value.relation==='parent').direction,'incoming');console.log('legacy link HTTP contracts verified');
            """;
        var builder=new ProcessBuilder(System.getenv().getOrDefault("B1_TEST_NODE","node"),"--input-type=module").directory(Path.of(System.getProperty("b1RepositoryRoot"),"services/backend").toFile()).redirectErrorStream(true);
        builder.environment().put("LINK_BASE","http://127.0.0.1:"+port);builder.environment().put("LINK_TOKEN",TOKEN);builder.environment().put("LINK_SOURCE",SOURCE);builder.environment().put("LINK_TARGET",TARGET);
        var process=builder.start();try(var stdin=process.getOutputStream()){stdin.write(script.getBytes(java.nio.charset.StandardCharsets.UTF_8));}var output=new String(process.getInputStream().readAllBytes(),java.nio.charset.StandardCharsets.UTF_8);assertEquals(0,process.waitFor(),output);
        assertEquals(3,db.getCollection("record_links").countDocuments());assertEquals(0,db.getCollection("career_record_relations").countDocuments());assertEquals(0,db.getCollection("outbox_events").countDocuments());assertEquals(0,db.getCollection("career_command_idempotency").countDocuments());
        for(var record:List.of(SOURCE,TARGET)){var raw=stored(record);assertEquals(1L,raw.getLong("version"));assertEquals(3L,raw.getLong("referenceVersion"));assertEquals("document owner",raw.getString("bodyMd"));assertEquals(7L,raw.getLong("documentVersion"));assertEquals(new Document("legacy","preserve"),raw.get("properties"));assertEquals(List.of(),raw.get("propertyValues"));}
    }
    @Test void durableTupleReplaysAfterLostResponseAndUnrelatedLockWithoutFurtherWrites() throws Exception {
        var first=create(SOURCE,TARGET,"related");var source=stored(SOURCE);var target=stored(TARGET);var categories=db.getCollection("career_categories").find().sort(new Document("_id",1)).into(new ArrayList<>());
        db.getCollection("career_property_mutations").insertOne(CareerWriterMongoIntegrationTest.mutationLockJob(USER,CATEGORY,SOURCE,"pending"));
        assertEquals(first,create(SOURCE,TARGET,"related"));var reverse=create(TARGET,SOURCE,"related");assertEquals(first.get("id"),reverse.get("id"));assertEquals("incoming",reverse.get("direction").asText());
        assertEquals(1,db.getCollection("record_links").countDocuments());assertEquals(source,stored(SOURCE));assertEquals(target,stored(TARGET));assertEquals(categories,db.getCollection("career_categories").find().sort(new Document("_id",1)).into(new ArrayList<>()));
    }
    @Test void staleForeignDeletedAndInvalidRequestsLeaveNoLinkOrReferenceMutation() throws Exception {
        var invalid=List.of(post(BASE+SOURCE+"/links").header("If-Match","\"v2\"").content(body(TARGET,"parent")),post(BASE+SOURCE+"/links").header("If-Match","\"v1\"").content(body(FOREIGN,"related")),post(BASE+SOURCE+"/links").header("If-Match","\"v1\"").content(body(CORRUPT,"related")),post(BASE+SOURCE+"/links").content(body(TARGET,"parent")),post(BASE+SOURCE+"/links").header("If-Match","\"v1\"").content(body(SOURCE,"parent")),post(BASE+SOURCE+"/links").header("If-Match","\"v1\"").content(body(TARGET,"invalid")),post(BASE+SOURCE+"/links").header("If-Match","\"v1\"").content(new Document("toRecordId",TARGET).append("relation","related").append("userId",OTHER).toJson()));
        var statuses=List.of(412,404,404,400,400,400,400);var before=db.getCollection("career_records").find().sort(new Document("_id",1)).into(new ArrayList<>());
        for(int i=0;i<invalid.size();i++)call(invalid.get(i),statuses.get(i));
        var foreign=mvc.perform(post(BASE+SOURCE+"/links").header("Authorization","Bearer "+TOKEN2).header("If-Match","\"v1\"").contentType("application/json").content(body(TARGET,"related"))).andReturn().getResponse();assertEquals(404,foreign.getStatus());
        assertEquals(before,db.getCollection("career_records").find().sort(new Document("_id",1)).into(new ArrayList<>()));
        db.getCollection("career_records").updateOne(new Document("_id",TARGET),new Document("$set",new Document("deletedAt",new Date())));call(post(BASE+SOURCE+"/links").header("If-Match","\"v1\"").content(body(TARGET,"related")),404);
        assertEquals(0L,stored(SOURCE).getLong("referenceVersion"));assertEquals(0L,stored(TARGET).getLong("referenceVersion"));assertEquals(0,db.getCollection("record_links").countDocuments());
        call(get(BASE+FOREIGN+"/links"),404);
    }
    @Test void bothCategoryMutationLocksFenceNewLinksAndCompletionUnlocks() throws Exception {
        for(var locked:List.of(CATEGORY,TARGET_CATEGORY)) {
            seed();db.getCollection("career_property_mutations").insertOne(CareerWriterMongoIntegrationTest.mutationLockJob(USER,locked,locked.equals(CATEGORY)?SOURCE:TARGET,"failed"));
            var error=call(post(BASE+SOURCE+"/links").header("If-Match","\"v1\"").content(body(TARGET,"related")),409).get("error");assertEquals("CAREER_PROPERTY_MUTATION_ACTIVE",error.get("message").asText());assertTrue(error.get("details").get("retryable").asBoolean());
            assertEquals(0,db.getCollection("record_links").countDocuments());assertEquals(0L,stored(SOURCE).getLong("referenceVersion"));assertEquals(0L,stored(TARGET).getLong("referenceVersion"));
            db.getCollection("career_property_mutations").updateOne(new Document(),new Document("$set",new Document("status","completed").append("active",false).append("cursor",1).append("processedCount",1)));
            create(SOURCE,TARGET,"related");assertEquals(1,db.getCollection("record_links").countDocuments());
        }
    }
    @Test void failedLinkInsertRollsBackBothReferenceAndCategoryFences() throws Exception {
        var validator=db.listCollections().filter(new Document("name","record_links")).first().get("options",Document.class).get("validator",Document.class);
        var source=stored(SOURCE);var target=stored(TARGET);var categories=db.getCollection("career_categories").find().sort(new Document("_id",1)).into(new ArrayList<>());
        db.runCommand(new Document("collMod","record_links").append("validator",new Document("$expr",new Document("$eq",List.of(1,0)))));
        try {call(post(BASE+SOURCE+"/links").header("If-Match","\"v1\"").content(body(TARGET,"related")),500);assertEquals(source,stored(SOURCE));assertEquals(target,stored(TARGET));assertEquals(categories,db.getCollection("career_categories").find().sort(new Document("_id",1)).into(new ArrayList<>()));assertEquals(0,db.getCollection("record_links").countDocuments());}
        finally {db.runCommand(new Document("collMod","record_links").append("validator",validator));}
        create(SOURCE,TARGET,"related");
    }
    @Test void lifecycleRaceAfterSnapshotCannotAttachLinkToTrashedTarget() {
        var once=new java.util.concurrent.atomic.AtomicBoolean();
        CareerCommandRepository intercepted=new CareerCommandRepository() {
            public <T> T transaction(Actor actor,java.util.function.Function<Operations,T> work) {return repository.transaction(actor,operations->work.apply((Operations)java.lang.reflect.Proxy.newProxyInstance(Operations.class.getClassLoader(),new Class<?>[]{Operations.class},(proxy,method,args)->{
                if(method.getName().equals("guardActive") && once.compareAndSet(false,true))try(var session=client.startSession()){session.withTransaction(()->{db.getCollection("career_records").updateOne(session,new Document("_id",TARGET).append("userId",USER).append("deletedAt",null),new Document("$set",new Document("deletedAt",new Date()).append("purgeAfter",Date.from(Instant.now().plusSeconds(3600)))).append("$inc",new Document("version",1L).append("referenceVersion",1L)));return null;});}
                try{return method.invoke(operations,args);}catch(java.lang.reflect.InvocationTargetException error){throw error.getCause();}
            })));}
        };
        var service=new CareerCommandService(intercepted,Clock.systemUTC(),new CareerMoveTokens("disposable-link-test-secret-at-least-32-bytes"));
        try {var method=CareerCommandService.class.getMethod("createLink",CareerCommandRepository.Actor.class,String.class,long.class,String.class,String.class);var error=assertThrows(java.lang.reflect.InvocationTargetException.class,()->method.invoke(service,repository.authenticate(TOKEN),SOURCE,1L,TARGET,"related"));assertEquals(404,((CareerCommandException)error.getCause()).status());}
        catch(NoSuchMethodException error){fail("Spring link command is required",error);}
        assertTrue(once.get());assertEquals(0,db.getCollection("record_links").countDocuments());assertEquals(0L,stored(SOURCE).getLong("referenceVersion"));assertEquals(1L,stored(TARGET).getLong("referenceVersion"));
    }
}

package com.expresso.backend.career;

import static org.junit.jupiter.api.Assertions.*;
import java.nio.file.Path;
import java.time.*;
import java.util.*;
import com.mongodb.client.*;
import org.bson.Document;
import org.bson.types.Decimal128;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import tools.jackson.databind.json.JsonMapper;
import com.expresso.backend.career.application.*;
import com.expresso.backend.career.application.PatchCareerBusinessCommand.PropertyDelta;
import com.expresso.backend.career.domain.*;
import com.expresso.backend.career.infrastructure.mongo.MongoCareerCommandRepository;

@EnabledIfEnvironmentVariable(named="B1_TEST_MONGO_URL",matches=".+")
class CareerPropertyMutationMongoIntegrationTest {
    static final String USER=id(2),CAT=id(3),RID=id(4),PID=id(11),OTHER=id(12),JOB=id(20),LEASE=id(21),TOKEN="exps_"+"C".repeat(43);
    static final String DB="expresso_test_prc_java_"+UUID.randomUUID().toString().replace("-","");
    static MongoClient client; static MongoDatabase db;
    static final JsonMapper JSON=JsonMapper.builder().build();
    MongoCareerCommandRepository repository;
    String currentJob=JOB;
    int jobSequence;
    static String id(int n) {return String.format("00000000-0000-4000-8000-%012d",n);}
    @BeforeAll static void migrate() throws Exception {
        var root=Path.of(System.getProperty("b1RepositoryRoot"));
        var process=new ProcessBuilder(System.getenv().getOrDefault("B1_TEST_NODE","node"),root.resolve("services/backend-spring/src/test/migrate-test-database.mjs").toString(),System.getenv("B1_TEST_MONGO_URL"),DB).inheritIO().start();
        assertEquals(0,process.waitFor());client=MongoClients.create(System.getenv("B1_TEST_MONGO_URL"));db=client.getDatabase(DB);
    }
    @AfterAll static void cleanup() {if(client!=null)try{db.drop();}finally{client.close();}}
    @BeforeEach void seed() {
        currentJob=JOB;jobSequence=0;
        for(var name:List.of("career_records","career_categories","career_property_mutations","career_property_mutation_receipts","outbox_events","users","identity_sessions")) db.getCollection(name).deleteMany(new Document());
        repository=new MongoCareerCommandRepository(client,db,Clock.systemUTC());
        db.getCollection("users").insertOne(new Document("_id",USER).append("email","prc@example.test").append("displayName","tester").append("planId",id(91)).append("createdAt",new Date()).append("deletionRequestedAt",null));
        db.getCollection("identity_sessions").insertOne(new Document("_id",id(92)).append("userId",USER).append("tokenHash",CareerMoveTokens.hash(TOKEN)).append("expiresAt",Date.from(Instant.now().plusSeconds(3600))).append("createdAt",new Date()).append("revokedAt",null));
        var target=definition("number",2,null);
        db.getCollection("career_categories").insertOne(new Document("_id",CAT).append("userId",USER).append("isSystem",false).append("key","prc").append("name","prc").append("icon","folder").append("defaultView","table").append("sortOrder",0).append("propertySchema",new Document()).append("propertySchemaV2",List.of(target)).append("version",2L).append("schemaVersion",2L).append("updatedAt",new Date()));
        db.getCollection("career_records").insertOne(new Document("_id",RID).append("userId",USER).append("categoryId",CAT).append("title","title").append("status","draft").append("origin","manual").append("version",1L).append("updatedAt",Date.from(Instant.EPOCH)).append("properties",new Document("legacy","do not read")).append("bodyMd","document sentinel").append("blockBody",List.of(new Document("opaque",true))).append("documentVersion",7L).append("latestSnapshotId",id(93)).append("referenceVersion",4L).append("propertyValues",List.of(new Document("propertyDefinitionId",PID).append("type","text").append("value","42.1200"),new Document("propertyDefinitionId",OTHER).append("type","text").append("value","unrelated"))));
        job("conversion",definition("text",1,null),target,true);
    }
    static Document definition(String type,long version,String deletedAt) {return new Document("id",PID).append("key","p").append("name","속성").append("type",type).append("required",false).append("system",false).append("config",new Document()).append("order",0).append("version",version).append("deletedAt",deletedAt);}
    void job(String kind,Document source,Document target,boolean confirm) {
        var plan=new Document("userId",USER).append("categoryId",CAT).append("categoryVersion",2).append("schemaVersion",2).append("definitions",List.of(target)).append("recordIds",List.of(RID)).append("operation",new Document("kind",kind).append("source",source).append("target",target).append("defaultValue",null).append("confirmLossy",confirm));
        var planJson=JSON.writeValueAsString(plan); var now=new Date();
        db.getCollection("career_property_mutations").updateMany(new Document(),new Document("$set",new Document("active",false).append("status","completed").append("completedAt",now)));
        currentJob=jobSequence++==0?JOB:id(200+jobSequence);
        db.getCollection("career_property_mutations").insertOne(new Document("_id",currentJob).append("userId",USER).append("categoryId",CAT).append("propertyId",PID).append("planJson",planJson).append("operationFingerprint",CareerMoveTokens.hash(planJson)).append("status","running").append("active",true).append("cursor",0).append("processedCount",0).append("skippedCount",0).append("attempts",1).append("leaseToken",LEASE).append("leaseUntil",Date.from(Instant.now().plusSeconds(120))).append("lastError",null).append("createdAt",now).append("updatedAt",now).append("completedAt",null).append("commitFence",0L));
    }
    Object commit(long expected,PropertyDelta delta) throws Exception {
        var serviceClass=assertDoesNotThrow(() -> Class.forName("com.expresso.backend.career.application.CareerPropertyMutationService"));
        var commandClass=Class.forName("com.expresso.backend.career.application.CareerPropertyMutationCommand");
        var service=serviceClass.getConstructor(CareerCommandRepository.class,Clock.class).newInstance(repository,Clock.systemUTC());
        var fingerprint=db.getCollection("career_property_mutations").find(new Document("_id",currentJob)).first().getString("operationFingerprint");
        var command=commandClass.getConstructor(String.class,String.class,long.class,String.class,String.class,PropertyDelta.class).newInstance(currentJob,RID,expected,LEASE,fingerprint,delta);
        try {return serviceClass.getMethod("commit",CareerCommandRepository.Actor.class,commandClass).invoke(service,repository.authenticate(TOKEN),command);}
        catch(java.lang.reflect.InvocationTargetException error) {if(error.getCause() instanceof RuntimeException exception)throw exception;throw error;}
    }
    Document stored() {return db.getCollection("career_records").find(new Document("_id",RID)).first();}
    PropertyDelta number(String value) {return new PropertyDelta(List.of(new NumberPropertyValue(PID,new java.math.BigDecimal(value))),List.of());}
    void schemaJob(String kind,Document source,Document target) {
        db.getCollection("career_categories").updateOne(new Document("_id",CAT),new Document("$set",new Document("propertySchemaV2",List.of(target))));
        job(kind,source,target,true);
    }
    @Test void restorationConsumesDeletionTombstoneWhenNewCanonicalValueAlreadyExists() throws Exception {
        var active=definition("text",1,null);var deleted=definition("text",2,"2026-10-07T01:00:00Z");var restored=definition("text",3,null);
        schemaJob("deletion",active,deleted);commit(1,new PropertyDelta(List.of(),List.of(PID)));
        db.getCollection("career_records").updateOne(new Document("_id",RID),new Document("$push",new Document("propertyValues",new Document("propertyDefinitionId",PID).append("type","text").append("value","new"))).append("$set",new Document("version",3L)));
        schemaJob("restoration",deleted,restored);var before=stored();var outboxCount=db.getCollection("outbox_events").countDocuments();
        var result=(CareerPropertyMutationService.Result)commit(3,new PropertyDelta(List.of(),List.of()));
        assertFalse(result.changed());assertEquals(3L,stored().getLong("version"));assertEquals(before.get("updatedAt"),stored().get("updatedAt"));
        assertEquals(before.get("propertyValues"),stored().get("propertyValues"));assertEquals(outboxCount,db.getCollection("outbox_events").countDocuments());
        assertFalse(stored().get("propertyValueTombstones",Document.class).containsKey(PID));
        var replay=(CareerPropertyMutationService.Result)commit(3,new PropertyDelta(List.of(),List.of()));assertTrue(replay.replayed());assertEquals(outboxCount,db.getCollection("outbox_events").countDocuments());
        db.getCollection("career_records").updateOne(new Document("_id",RID),new Document("$pull",new Document("propertyValues",new Document("propertyDefinitionId",PID))).append("$set",new Document("version",4L)));
        var deletedAgain=definition("text",4,"2026-10-07T02:00:00Z");schemaJob("deletion",restored,deletedAgain);commit(4,new PropertyDelta(List.of(),List.of(PID)));
        schemaJob("restoration",deletedAgain,definition("text",5,null));commit(4,new PropertyDelta(List.of(),List.of()));
        assertEquals(4L,stored().getLong("version"));assertEquals(1,stored().getList("propertyValues",Document.class).size());assertEquals("unrelated",stored().getList("propertyValues",Document.class).getFirst().getString("value"));
    }
    @Test void restorationRejectsDifferentGenerationConfigAndSchemaBindingsWithoutConsuming() throws Exception {
        var deleted=definition("text",2,"2026-10-07T01:00:00Z");
        schemaJob("deletion",definition("text",1,null),deleted);commit(1,new PropertyDelta(List.of(),List.of(PID)));
        var original=stored().get("propertyValueTombstones",Document.class).get(PID,Document.class);
        schemaJob("restoration",deleted,definition("text",3,null));
        for(var entry:Map.<String,Object>of("propertyDefinitionId",OTHER,"deletionMutationId",currentJob,"definitionVersion",99L,"deletedAt","2026-10-07T00:00:00Z","type","number","config",new Document("invalid",true),"categoryId",id(98),"categoryVersion",99L,"schemaVersion",99L).entrySet()) {
            var invalid=new Document(original);invalid.put(entry.getKey(),entry.getValue());
            db.getCollection("career_records").updateOne(new Document("_id",RID),new Document("$set",new Document("propertyValueTombstones."+PID,invalid)));
            var before=stored();
            assertThrows(CareerCommandException.class,()->commit(2,new PropertyDelta(List.of(new TextualPropertyValue(PID,PropertyValueType.TEXT,"42.1200")),List.of())),entry.getKey());
            assertEquals(before,stored());
        }
        db.getCollection("career_records").updateOne(new Document("_id",RID),new Document("$set",new Document("propertyValueTombstones."+PID,original)));
        var otherGeneration=definition("text",2,"2026-10-07T02:00:00Z");schemaJob("restoration",otherGeneration,definition("text",3,null));
        assertThrows(CareerCommandException.class,()->commit(2,new PropertyDelta(List.of(new TextualPropertyValue(PID,PropertyValueType.TEXT,"42.1200")),List.of())));
        var changedConfig=definition("text",3,null).append("config",new Document("changed",true));schemaJob("restoration",deleted,changedConfig);
        assertThrows(CareerCommandException.class,()->commit(2,new PropertyDelta(List.of(new TextualPropertyValue(PID,PropertyValueType.TEXT,"42.1200")),List.of())));
        assertEquals(original,stored().get("propertyValueTombstones",Document.class).get(PID));assertEquals(1,db.getCollection("outbox_events").countDocuments());
    }
    @Test void deletionTombstonesRoundTripDecimalDateSelectMultiFileAndMediaWithoutLoss() throws Exception {
        var option=id(71);var second=id(72);
        var options=new Document("options",List.of(new Document("id",option).append("label","첫째"),new Document("id",second).append("label","둘째")));
        var date=new Document("precision","datetime").append("start","2026-09-01T03:02:01.123456789+09:00").append("end","2026-09-02T04:03:02.987654321+09:00").append("timezone","Asia/Seoul");
        var examples=List.of(new Document("type","number").append("value",new Decimal128(new java.math.BigDecimal("42.1200"))),new Document("type","date").append("value",date),new Document("type","select").append("value",option),new Document("type","multi_select").append("value",List.of(second,option)),new Document("type","file").append("value",List.of(id(73),id(74))),new Document("type","media").append("value",List.of(id(75),id(76))));
        long version=1;
        for(var example:examples) {
            var value=new Document(example).append("propertyDefinitionId",PID);var type=example.getString("type");var config=Set.of("select","multi_select").contains(type)?options:new Document();
            db.getCollection("career_records").updateOne(new Document("_id",RID),new Document("$set",new Document("propertyValues",List.of(value)).append("version",version)));
            var source=definition(type,1,null).append("config",config);var deleted=definition(type,2,"2026-10-07T01:00:00Z").append("config",config);
            schemaJob("deletion",source,deleted);commit(version,new PropertyDelta(List.of(),List.of(PID)));version++;
            var tombstone=stored().get("propertyValueTombstones",Document.class).get(PID,Document.class);assertEquals(value,tombstone.get("value",Document.class));
            schemaJob("restoration",deleted,definition(type,3,null).append("config",config));
            var service=new CareerPropertyMutationService(repository,Clock.systemUTC());var fingerprint=db.getCollection("career_property_mutations").find(new Document("_id",currentJob)).first().getString("operationFingerprint");
            var read=service.read(repository.authenticate(TOKEN),currentJob,RID,LEASE,fingerprint);assertNotNull(read.tombstone());
            commit(version,new PropertyDelta(List.of(read.tombstone()),List.of()));version++;
            assertEquals(List.of(value),stored().getList("propertyValues",Document.class));assertFalse(stored().get("propertyValueTombstones",Document.class).containsKey(PID));
        }
    }
    @Test void canonicalCommitPreservesUnrelatedValuesDocumentAndLegacyAndReplaysOnce() throws Exception {
        commit(1,number("42.1200")); var after=stored();
        assertEquals(2L,after.getLong("version"));assertEquals(new Decimal128(new java.math.BigDecimal("42.1200")),after.getList("propertyValues",Document.class).getFirst().get("value"));
        assertEquals("unrelated",after.getList("propertyValues",Document.class).get(1).getString("value"));
        assertEquals("document sentinel",after.getString("bodyMd"));assertEquals(7L,after.getLong("documentVersion"));assertEquals(id(93),after.getString("latestSnapshotId"));assertEquals(4L,after.getLong("referenceVersion"));assertEquals(new Document("legacy","do not read"),after.get("properties"));assertEquals(List.of(new Document("opaque",true)),after.get("blockBody"));
        commit(1,number("42.1200")); assertEquals(after,stored());assertEquals(1,db.getCollection("career_property_mutation_receipts").countDocuments());
        var outbox=db.getCollection("outbox_events").find().first();assertEquals(List.of(PID),outbox.get("payload",Document.class).get("changedPropertyIds"));assertEquals(1,db.getCollection("outbox_events").countDocuments());
    }
    @Test void mismatchedDeltaAndStaleVersionCannotWrite() throws Exception {
        assertThrows(CareerCommandException.class,()->commit(1,number("99")));assertEquals(1L,stored().getLong("version"));
        assertThrows(CareerCommandException.class,()->commit(2,number("42.1200")));assertEquals(0,db.getCollection("outbox_events").countDocuments());
    }
    @Test void expiredLeaseAndSameVersionSchemaTamperingRejectCommit() throws Exception {
        db.getCollection("career_property_mutations").updateOne(new Document("_id",JOB),new Document("$set",new Document("leaseUntil",Date.from(Instant.EPOCH))));
        assertThrows(CareerCommandException.class,()->commit(1,number("42.1200")));
        job("conversion",definition("text",1,null),definition("number",2,null),true);
        db.getCollection("career_categories").updateOne(new Document("_id",CAT),new Document("$set",new Document("propertySchemaV2.0.name","tampered")));
        assertThrows(CareerCommandException.class,()->commit(1,number("42.1200")));assertEquals(1L,stored().getLong("version"));
    }
    @Test void duplicateConcurrentCommitAndReceiptAfterLaterEditDoNotOverwrite() throws Exception {
        try(var executor=java.util.concurrent.Executors.newVirtualThreadPerTaskExecutor()) {
            var first=executor.submit(()->commit(1,number("42.1200")));var second=executor.submit(()->commit(1,number("42.1200")));first.get();second.get();
        }
        assertEquals(2L,stored().getLong("version"));assertEquals(1,db.getCollection("outbox_events").countDocuments());
        db.getCollection("career_records").updateOne(new Document("_id",RID),new Document("$set",new Document("title","later edit").append("version",3L)));
        var replay=(CareerPropertyMutationService.Result)commit(1,number("42.1200"));assertTrue(replay.replayed());assertEquals(2,replay.record().version());assertEquals("later edit",stored().getString("title"));assertEquals(3L,stored().getLong("version"));
    }
    @Test void deletionAndRestorationAreAtomicCanonicalDeltas() throws Exception {
        var deleted=definition("text",2,Instant.now().toString());
        db.getCollection("career_categories").updateOne(new Document("_id",CAT),new Document("$set",new Document("propertySchemaV2",List.of(deleted))));job("deletion",definition("text",1,null),deleted,true);
        job("deletion",definition("text",1,null),deleted,false);assertThrows(CareerCommandException.class,()->commit(1,new PropertyDelta(List.of(),List.of(PID))));job("deletion",definition("text",1,null),deleted,true);
        commit(1,new PropertyDelta(List.of(),List.of(PID)));assertEquals(1,stored().getList("propertyValues",Document.class).size());
        assertEquals("42.1200",stored().get("propertyValueTombstones",Document.class).get(PID,Document.class).get("value",Document.class).getString("value"));
        db.getCollection("career_property_mutation_receipts").deleteMany(new Document());var restored=definition("text",3,null);
        db.getCollection("career_categories").updateOne(new Document("_id",CAT),new Document("$set",new Document("propertySchemaV2",List.of(restored))));job("restoration",deleted,restored,true);
        commit(2,new PropertyDelta(List.of(new TextualPropertyValue(PID,PropertyValueType.TEXT,"42.1200")),List.of()));
        assertEquals(3L,stored().getLong("version"));assertEquals(2,stored().getList("propertyValues",Document.class).size());assertFalse(stored().get("propertyValueTombstones",Document.class).containsKey(PID));assertEquals("document sentinel",stored().getString("bodyMd"));
    }
    @Test void maxVersionNoOpReceiptDoesNotEmitOutboxAndActualChangeFails() throws Exception {
        var target=definition("text",2,null);db.getCollection("career_categories").updateOne(new Document("_id",CAT),new Document("$set",new Document("propertySchemaV2",List.of(target))));job("conversion",definition("text",1,null),target,false);
        db.getCollection("career_records").updateOne(new Document("_id",RID),new Document("$set",new Document("version",CareerRecord.MAX_VERSION)));
        var result=(CareerPropertyMutationService.Result)commit(CareerRecord.MAX_VERSION,new PropertyDelta(List.of(new TextualPropertyValue(PID,PropertyValueType.TEXT,"42.1200")),List.of()));assertFalse(result.changed());assertEquals(CareerRecord.MAX_VERSION,stored().getLong("version"));assertEquals(0,db.getCollection("outbox_events").countDocuments());
        db.getCollection("career_property_mutation_receipts").deleteMany(new Document());job("conversion",definition("text",1,null),definition("number",2,null),false);db.getCollection("career_categories").updateOne(new Document("_id",CAT),new Document("$set",new Document("propertySchemaV2",List.of(definition("number",2,null)))));
        assertThrows(IllegalStateException.class,()->commit(CareerRecord.MAX_VERSION,number("42.1200")));assertEquals(CareerRecord.MAX_VERSION,stored().getLong("version"));
    }
    @Test void outboxFailureRollsBackBusinessValueReceiptAndLeaseFence() throws Exception {
        var info=db.listCollections().filter(new Document("name","outbox_events")).first();var validator=info.get("options",Document.class).get("validator",Document.class);var before=stored();
        db.runCommand(new Document("collMod","outbox_events").append("validator",new Document("$jsonSchema",new Document("bsonType","object").append("required",List.of("intentionally_missing")))));
        try {assertThrows(com.mongodb.MongoException.class,()->commit(1,number("42.1200")));assertEquals(before,stored());assertEquals(0,db.getCollection("career_property_mutation_receipts").countDocuments());assertEquals(0L,db.getCollection("career_property_mutations").find().first().getLong("commitFence"));}
        finally {db.runCommand(new Document("collMod","outbox_events").append("validator",validator));}
    }
    @Test void leaseTakeoverDuringActualSpringCommandCannotCommit() {
        var swapped=new java.util.concurrent.atomic.AtomicBoolean();
        CareerCommandRepository intercepted=new CareerCommandRepository() {
            @Override public <T> T transaction(Actor actor,java.util.function.Function<Operations,T> work) {
                return repository.transaction(actor,operations->work.apply((Operations)java.lang.reflect.Proxy.newProxyInstance(Operations.class.getClassLoader(),new Class<?>[]{Operations.class},(proxy,method,args)->{
                    if(method.getName().equals("guardMutation") && swapped.compareAndSet(false,true)) db.getCollection("career_property_mutations").updateOne(new Document("_id",JOB),new Document("$set",new Document("leaseToken",id(99)).append("leaseUntil",Date.from(Instant.now().plusSeconds(120)))));
                    try {return method.invoke(operations,args);} catch(java.lang.reflect.InvocationTargetException error) {throw error.getCause();}
                })));
            }
        };
        var fingerprint=db.getCollection("career_property_mutations").find().first().getString("operationFingerprint");
        var service=new CareerPropertyMutationService(intercepted,Clock.systemUTC());var before=stored();
        assertThrows(CareerCommandException.class,()->service.commit(repository.authenticate(TOKEN),new CareerPropertyMutationCommand(JOB,RID,1,LEASE,fingerprint,number("42.1200"))));
        assertTrue(swapped.get());assertEquals(before,stored());assertEquals(0,db.getCollection("outbox_events").countDocuments());assertEquals(0,db.getCollection("career_property_mutation_receipts").countDocuments());assertEquals(id(99),db.getCollection("career_property_mutations").find().first().getString("leaseToken"));
    }
    @Test void b1TrashAndRestorePublishTargetStateInvalidationAtomically() {
        var commands=new CareerCommandService(repository,Clock.systemUTC(),new CareerMoveTokens("test-secret-".repeat(4)));var actor=repository.authenticate(TOKEN);var before=stored();
        commands.trash(actor,RID,1);var trashed=stored();assertNotNull(trashed.getDate("deletedAt"));assertEquals(2L,trashed.getLong("version"));
        var trashEvent=db.getCollection("outbox_events").find(new Document("topic","career.computation.target-state")).first();assertNotNull(trashEvent);
        assertEquals(new Document("userId",USER).append("targetRecordId",RID).append("targetRecordVersion",2L),trashEvent.get("payload",Document.class));
        assertEquals("spring-career-target-state:"+RID+":v2",trashEvent.getString("idempotencyKey"));
        commands.restore(actor,RID,2);var restored=stored();assertNull(restored.get("deletedAt"));assertEquals(3L,restored.getLong("version"));
        var restoreEvent=db.getCollection("outbox_events").find(new Document("idempotencyKey","spring-career-target-state:"+RID+":v3")).first();assertNotNull(restoreEvent);
        assertEquals(new Document("userId",USER).append("targetRecordId",RID).append("targetRecordVersion",3L),restoreEvent.get("payload",Document.class));assertEquals(2,db.getCollection("outbox_events").countDocuments());
        for(var field:List.of("propertyValues","bodyMd","blockBody","documentVersion","latestSnapshotId","properties"))assertEquals(before.get(field),restored.get(field),field);
        assertEquals(6L,restored.getLong("referenceVersion"));
        assertThrows(CareerCommandException.class,()->commands.restore(actor,RID,2));assertEquals(2,db.getCollection("outbox_events").countDocuments());
    }
    @Test void targetStateInvalidationFailureRollsBackBothLifecycleDirections() {
        var commands=new CareerCommandService(repository,Clock.systemUTC(),new CareerMoveTokens("test-secret-".repeat(4)));var actor=repository.authenticate(TOKEN);
        var info=db.listCollections().filter(new Document("name","outbox_events")).first();var validator=info.get("options",Document.class).get("validator",Document.class);
        var reject=new Document("$jsonSchema",new Document("bsonType","object").append("required",List.of("intentionally_missing")));var before=stored();
        db.runCommand(new Document("collMod","outbox_events").append("validator",reject));
        try {assertThrows(com.mongodb.MongoException.class,()->commands.trash(actor,RID,1));assertEquals(before,stored());assertEquals(0,db.getCollection("outbox_events").countDocuments());}
        finally {db.runCommand(new Document("collMod","outbox_events").append("validator",validator));}
        commands.trash(actor,RID,1);var trashed=stored();db.runCommand(new Document("collMod","outbox_events").append("validator",reject));
        try {assertThrows(com.mongodb.MongoException.class,()->commands.restore(actor,RID,2));assertEquals(trashed,stored());assertEquals(1,db.getCollection("outbox_events").countDocuments());}
        finally {db.runCommand(new Document("collMod","outbox_events").append("validator",validator));}
    }
}

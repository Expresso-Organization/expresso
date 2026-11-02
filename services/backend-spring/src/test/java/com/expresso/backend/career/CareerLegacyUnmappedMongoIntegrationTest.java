package com.expresso.backend.career;

import static org.junit.jupiter.api.Assertions.*;
import java.nio.file.Path;
import java.time.*;
import java.util.*;
import com.mongodb.client.*;
import org.bson.Document;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import com.expresso.backend.career.application.*;
import com.expresso.backend.career.application.CareerCommandRepository.Actor;
import com.expresso.backend.career.infrastructure.mongo.MongoCareerCommandRepository;

@EnabledIfEnvironmentVariable(named="B1_TEST_MONGO_URL", matches=".+")
class CareerLegacyUnmappedMongoIntegrationTest {
    static final String DB="expresso_test_pr153_legacy_"+UUID.randomUUID().toString().replace("-", "");
    static final String USER=id(2), RECORD=id(10), TARGET=id(20), TOKEN="exps_"+"L".repeat(43);
    static final Clock CLOCK=Clock.fixed(Instant.parse("2026-10-30T00:00:00Z"),ZoneOffset.UTC);
    static MongoClient client; static MongoDatabase db; static Document baseline;
    CareerCommandService service; Actor actor; String sourceCategory, roleId;
    static String id(int n){return String.format("00000000-0000-4000-8000-%012d",n);}

    @BeforeAll static void prepare() throws Exception {
        var script=Path.of(System.getProperty("b1RepositoryRoot"),"services/backend-spring/src/test/legacy-unmapped-fixture.mjs");
        var process=new ProcessBuilder(System.getenv().getOrDefault("B1_TEST_NODE","node"),script.toString(),System.getenv("B1_TEST_MONGO_URL"),DB,USER,RECORD).inheritIO().start();
        assertEquals(0,process.waitFor());
        client=MongoClients.create(System.getenv("B1_TEST_MONGO_URL"));db=client.getDatabase(DB);
        baseline=db.getCollection("career_records").find(new Document("_id",RECORD)).first();assertNotNull(baseline);
    }
    @AfterAll static void cleanup(){if(client!=null){try{db.drop();}finally{client.close();}}}
    @BeforeEach void reset(){
        db.getCollection("outbox_events").deleteMany(new Document());
        db.getCollection("career_records").deleteMany(new Document());
        db.getCollection("career_records").insertOne(new Document(baseline));
        db.getCollection("identity_sessions").deleteMany(new Document());
        db.getCollection("identity_sessions").insertOne(new Document("_id",UUID.randomUUID().toString()).append("userId",USER).append("tokenHash",CareerMoveTokens.hash(TOKEN)).append("expiresAt",Date.from(Instant.now().plusSeconds(3600))).append("createdAt",Date.from(CLOCK.instant())).append("revokedAt",null));
        db.getCollection("career_categories").deleteOne(new Document("_id",TARGET));
        db.getCollection("career_categories").insertOne(new Document("_id",TARGET).append("userId",USER).append("key","pr153target").append("name","Target").append("icon","folder").append("defaultView","list").append("sortOrder",9).append("propertySchemaV2",List.of()).append("schemaVersion",1L).append("version",1L).append("updatedAt",Date.from(CLOCK.instant())));
        sourceCategory=baseline.getString("categoryId");
        roleId=db.getCollection("career_categories").find(new Document("_id",sourceCategory)).first().getList("propertySchemaV2",Document.class).stream().filter(d->"role".equals(d.getString("key"))).findFirst().orElseThrow().getString("id");
        var repository=new MongoCareerCommandRepository(client,db,CLOCK);
        actor=repository.authenticate(TOKEN);service=new CareerCommandService(repository,CLOCK,new CareerMoveTokens("disposable-pr153-move-secret-at-least-32-bytes"));
    }
    Document stored(){return db.getCollection("career_records").find(new Document("_id",RECORD)).first();}
    Document bag(){return stored().get("unmappedProperties",Document.class);}
    void setBag(Document value){db.getCollection("career_records").updateOne(new Document("_id",RECORD),new Document("$set",new Document("unmappedProperties",value)));}
    PatchCareerBusinessCommand title(){return new PatchCareerBusinessCommand(Optional.of("Changed"),Optional.empty(),Optional.empty());}
    Document envelope(){return new Document("sourceCategoryId",sourceCategory).append("propertyValue",new Document("propertyDefinitionId",id(95)).append("type","text").append("value"," retained ")).append("provenance",new Document("sourcePropertyKey","retained").append("sourcePropertyName","Retained").append("sourcePropertyDefinitionVersion",1L).append("preservedAt",CLOCK.instant().toString()).append("sourceRecordVersion",1L).append("reason","no_target_property"));}

    @Test void actual0017RawKeyAndUuidValuesSurvivePatchTrashRestore(){
        var before=bag();assertTrue(before.containsKey(roleId));assertTrue(before.containsKey("historicalKey"));
        assertEquals(2,service.patch(actor,RECORD,1,title()).version());assertEquals(before,bag());
        assertEquals(3,service.trash(actor,RECORD,2).version());assertEquals(before,bag());
        assertEquals(4,service.restore(actor,RECORD,3).version());assertEquals(before,bag());
    }
    @Test void mixedLegacyAndEnvelopeSurviveMoveWithoutInventedProvenance(){
        var before=bag();before.append(id(95),envelope());setBag(before);
        var preview=service.previewMove(actor,RECORD,1,TARGET);
        assertEquals(List.of(id(95)),preview.unmappedPropertyIds());
        var moved=service.move(actor,RECORD,1,TARGET,preview.previewToken());
        assertEquals(TARGET,moved.categoryId());assertEquals(before,bag());assertEquals(2,moved.version());
    }
    @Test void legacyOnlyMovePreservesTheOriginalBsonBag(){
        var before=bag();var preview=service.previewMove(actor,RECORD,1,TARGET);
        assertTrue(preview.unmappedPropertyIds().isEmpty());
        assertEquals(TARGET,service.move(actor,RECORD,1,TARGET,preview.previewToken()).categoryId());
        assertEquals(before,bag());
    }
    @Test void envelopeOnlySurvivesPatchTrashRestoreAndMove(){
        var before=new Document(id(95),envelope());setBag(before);
        service.patch(actor,RECORD,1,title());assertEquals(before,bag());
        service.trash(actor,RECORD,2);assertEquals(before,bag());
        service.restore(actor,RECORD,3);assertEquals(before,bag());
        var preview=service.previewMove(actor,RECORD,4,TARGET);
        assertEquals(5,service.move(actor,RECORD,4,TARGET,preview.previewToken()).version());assertEquals(before,bag());
    }
    @Test void mixedLifecycleAndMovePreserveTheOriginalEnvelopeRepresentation(){
        var existing=envelope();existing.get("provenance",Document.class).put("preservedAt","2026-10-30T00:00:00.000Z");
        var before=bag();before.append(id(95),existing);setBag(before);
        service.patch(actor,RECORD,1,title());assertEquals(before,bag());
        service.trash(actor,RECORD,2);assertEquals(before,bag());
        service.restore(actor,RECORD,3);assertEquals(before,bag());
        var preview=service.previewMove(actor,RECORD,4,TARGET);
        service.move(actor,RECORD,4,TARGET,preview.previewToken());assertEquals(before,bag());
    }
    @Test void collidingLegacyKeyBlocksPreviewWithoutChangingAnyValues(){
        db.getCollection("career_records").updateOne(new Document("_id",RECORD),new Document("$set",new Document("propertyValues",List.of(new Document("propertyDefinitionId",roleId).append("type","text").append("value","new value")))));
        var before=stored();var error=assertThrows(CareerCommandException.class,()->service.previewMove(actor,RECORD,1,TARGET));
        assertEquals(409,error.status());assertEquals("LEGACY_UNMAPPED_PROPERTY_CONFLICT",error.code());assertEquals(before,stored());
    }
    @Test void collidingLegacyKeyAlsoBlocksCommitWithoutOverwrite(){
        var raw=bag();var legacy=raw.remove(roleId);setBag(raw);
        db.getCollection("career_records").updateOne(new Document("_id",RECORD),new Document("$set",new Document("propertyValues",List.of(new Document("propertyDefinitionId",roleId).append("type","text").append("value","new value")))));
        var preview=service.previewMove(actor,RECORD,1,TARGET);
        raw.append(roleId,legacy);setBag(raw);var before=stored();
        var error=assertThrows(CareerCommandException.class,()->service.move(actor,RECORD,1,TARGET,preview.previewToken()));
        assertEquals(409,error.status());assertEquals("LEGACY_UNMAPPED_PROPERTY_CONFLICT",error.code());assertEquals(before,stored());
    }
    @Test void malformedEnvelopeFailsExplicitlyAndDoesNotMutateRecord(){
        var raw=bag();raw.append(id(96),new Document("sourceCategoryId",sourceCategory));setBag(raw);var before=stored();
        var error=assertThrows(CareerCommandException.class,()->service.patch(actor,RECORD,1,title()));
        assertEquals(409,error.status());assertEquals("UNMAPPED_PROPERTY_FORMAT_UNSUPPORTED",error.code());assertEquals(before,stored());
    }
}

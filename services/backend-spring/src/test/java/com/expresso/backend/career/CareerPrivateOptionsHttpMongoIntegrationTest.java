package com.expresso.backend.career;

import static org.junit.jupiter.api.Assertions.*;
import java.nio.file.Path;
import java.time.Instant;
import java.util.*;
import org.bson.Document;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import com.expresso.backend.career.application.CareerMoveTokens;

@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT,properties={"career.writer.enabled=true","career.property-mutation.enabled=true","spring.main.web-application-type=servlet","career.writer.move-secret=disposable-test-secret-at-least-32-bytes","career.property-mutation.secret=disposable-mutation-secret-at-least-32-bytes"})
@EnabledIfEnvironmentVariable(named="B1_TEST_MONGO_URL",matches=".+")
class CareerPrivateOptionsHttpMongoIntegrationTest {
    static final String DB="expresso_test_b1_java_"+UUID.randomUUID().toString().replace("-","");
    static final String USER=id(2),OTHER=id(4),CATEGORY=id(3),PROPERTY=id(15),TOKEN="exps_"+"O".repeat(43),OTHER_TOKEN="exps_"+"P".repeat(43),TARGET=id(5),TARGET_PROPERTY=id(16),TARGET_OPTION=id(407);
    static com.mongodb.client.MongoClient client;
    static com.mongodb.client.MongoDatabase db;
    @org.springframework.boot.test.web.server.LocalServerPort int port;
    static String id(int number){return String.format("00000000-0000-4000-8000-%012d",number);}
    @DynamicPropertySource static void properties(DynamicPropertyRegistry registry){
        registry.add("career.writer.mongo-uri",()->System.getenv("B1_TEST_MONGO_URL"));registry.add("career.writer.database",()->DB);
    }
    @BeforeAll static void migrate() throws Exception {
        var root=Path.of(System.getProperty("b1RepositoryRoot"));
        var process=new ProcessBuilder(System.getenv().getOrDefault("B1_TEST_NODE","node"),root.resolve("services/backend-spring/src/test/migrate-test-database.mjs").toString(),System.getenv("B1_TEST_MONGO_URL"),DB).inheritIO().start();
        assertEquals(0,process.waitFor());client=com.mongodb.client.MongoClients.create(System.getenv("B1_TEST_MONGO_URL"));db=client.getDatabase(DB);
    }
    @AfterAll static void cleanup(){if(client!=null)try{db.drop();}finally{client.close();}}
    @BeforeEach void seed(){
        for(var name:List.of("career_property_options","career_records","career_categories","career_property_mutations","career_property_mutation_receipts","career_command_idempotency","outbox_events","users","identity_sessions"))db.getCollection(name).deleteMany(new Document());
        var now=new Date();
        for(var user:List.of(USER,OTHER))db.getCollection("users").insertOne(new Document("_id",user).append("email",user+"@example.test").append("displayName","tester").append("planId",id(91)).append("createdAt",now).append("deletionRequestedAt",null));
        db.getCollection("identity_sessions").insertOne(new Document("_id",id(92)).append("userId",USER).append("tokenHash",CareerMoveTokens.hash(TOKEN)).append("expiresAt",Date.from(Instant.now().plusSeconds(3600))).append("createdAt",now).append("revokedAt",null));
        db.getCollection("identity_sessions").insertOne(new Document("_id",id(94)).append("userId",OTHER).append("tokenHash",CareerMoveTokens.hash(OTHER_TOKEN)).append("expiresAt",Date.from(Instant.now().plusSeconds(3600))).append("createdAt",now).append("revokedAt",null));
        var definition=new Document("id",PROPERTY).append("key","tags").append("name","태그").append("type","multi_select").append("required",false).append("system",false).append("config",new Document("legacyFreeformTags",true).append("options",List.of())).append("order",0).append("version",1L).append("deletedAt",null);
        db.getCollection("career_categories").insertOne(new Document("_id",CATEGORY).append("userId",USER).append("isSystem",false).append("key","option-lifecycle").append("name","option lifecycle").append("icon","folder").append("defaultView","table").append("sortOrder",0).append("propertySchema",new Document()).append("propertySchemaV2",List.of(definition)).append("version",1L).append("schemaVersion",1L).append("updatedAt",now));
        var targetDefinition=new Document(definition).append("id",TARGET_PROPERTY).append("type","select");
        var targetCategory=new Document(db.getCollection("career_categories").find(new Document("_id",CATEGORY)).first()).append("_id",TARGET).append("key","option-target").append("propertySchemaV2",List.of(targetDefinition));
        db.getCollection("career_categories").insertOne(targetCategory);
        db.getCollection("career_property_options").insertMany(List.of(
                new Document("_id",id(406)).append("userId",USER).append("categoryId",TARGET).append("propertyId",TARGET_PROPERTY).append("optionId",TARGET_OPTION).append("rawLabel"," Own ").append("version",1L).append("createdAt",now),
                new Document("_id",id(409)).append("userId",OTHER).append("categoryId",TARGET).append("propertyId",TARGET_PROPERTY).append("optionId",id(408)).append("rawLabel"," Own ").append("version",1L).append("createdAt",now)));
        db.getCollection("career_property_options").insertOne(new Document("_id",id(402)).append("userId",OTHER).append("categoryId",CATEGORY).append("propertyId",PROPERTY).append("optionId",id(403)).append("rawLabel","foreign private label").append("version",1L).append("createdAt",now));
    }
    void probe(String scenario) throws Exception {
        var root=Path.of(System.getProperty("b1RepositoryRoot"));
        var builder=new ProcessBuilder(System.getenv().getOrDefault("B1_TEST_NODE","node"),"--import","tsx",root.resolve("services/backend-spring/src/test/"+(scenario.equals("regular-select")?"ordinary-select-http-probe.mjs":"private-options-http-probe.mjs")).toString(),scenario).directory(root.resolve("services/backend").toFile()).redirectErrorStream(true);
        builder.environment().put("B2_OPTIONS_MONGO_URL",System.getenv("B1_TEST_MONGO_URL"));builder.environment().put("B2_OPTIONS_DB",DB);builder.environment().put("B2_OPTIONS_ENDPOINT","http://127.0.0.1:"+port);
        builder.environment().put("B2_OPTIONS_USER",USER);builder.environment().put("B2_OPTIONS_CATEGORY",CATEGORY);builder.environment().put("B2_OPTIONS_PROPERTY",PROPERTY);builder.environment().put("B2_OPTIONS_TOKEN",TOKEN);
        builder.environment().put("B2_OPTIONS_OTHER_TOKEN",OTHER_TOKEN);builder.environment().put("B2_OPTIONS_TARGET_CATEGORY",TARGET);builder.environment().put("B2_OPTIONS_TARGET_PROPERTY",TARGET_PROPERTY);builder.environment().put("B2_OPTIONS_TARGET_OPTION",TARGET_OPTION);
        var process=builder.start();var output=new String(process.getInputStream().readAllBytes(),java.nio.charset.StandardCharsets.UTF_8);assertEquals(0,process.waitFor(),output);
    }
    @Test void ordinarySelectWithoutApplicablePrivateLedgerKeepsOriginalOptionsAndRejectsForeignIds() throws Exception {probe("regular-select");}
    @Test void registeredTagsConvertToTextThenDeleteWithoutResidualLedgerLockAndKeepNormalPatchAvailable() throws Exception {probe("text");}
    @Test void registeredTagsConvertToSelectThenExistingUuidPatchKeepsOwnerScope() throws Exception {probe("select-patch");}
    @Test void registeredTagsConvertToSelectThenExistingUuidBusinessDuplicateKeepsOwnerScope() throws Exception {probe("select-duplicate");}
    @Test void registeredTagsConvertToSelectThenMoveUsesOnlyOwnerExactLabelMapping() throws Exception {probe("select-move");}
}
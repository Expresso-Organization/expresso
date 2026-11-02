package com.expresso.backend.career;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import java.time.Instant;
import org.bson.Document;
import com.mongodb.client.MongoClient;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import com.expresso.backend.career.infrastructure.mongo.MongoCareerCommandRepository;

@SpringBootTest(properties={"career.writer.enabled=true","career.integration.enabled=true","spring.main.web-application-type=servlet", "career.writer.mongo-uri=mongodb://127.0.0.1:1","career.writer.database=unused_mock_database", "career.writer.move-secret=disposable-test-secret-at-least-32-bytes", "career.integration.ai-secret=disposable-ai-secret-at-least-32-bytes", "career.integration.interview-secret=disposable-interview-secret-at-least-32-bytes"})
@AutoConfigureMockMvc
class CareerProducerAuthenticationTest {
    @Autowired MockMvc mvc;
    @MockitoBean MongoClient mongo;
    @MockitoBean MongoCareerCommandRepository repository;
    @Test void unknownScopeMalformedSignatureAndSessionCredentialsCannotEnterInternalRoute() throws Exception {
        for(var token:java.util.List.of("expi.not-json."+"A".repeat(43),"exps_"+"A".repeat(43),"expi.bad.bad")) {
            var response=mvc.perform(post(CareerProducerMongoIntegrationTest.PATH).header("Authorization","Bearer "+token).contentType("application/json").content("{}")).andReturn().getResponse(); assertEquals(401,response.getStatus()); assertFalse(response.getContentAsString().contains(token));
        }
    }
    @Test void signedDuplicateClaimsAndWrongAudienceAreRejected() throws Exception {
        var claims=new Document("producer","ai-proposal").append("userId",CareerProducerMongoIntegrationTest.USER).append("sourceId",CareerProducerMongoIntegrationTest.SOURCE).append("operationId",CareerProducerMongoIntegrationTest.OP).append("fingerprint","a".repeat(64)).append("audience","user-session").append("expiresAt",Instant.now().plusSeconds(60).toString());
        var credentials=new com.expresso.backend.career.integration.CareerProducerCredentials(CareerProducerMongoIntegrationTest.AI_SECRET,CareerProducerMongoIntegrationTest.INTERVIEW_SECRET,java.time.Clock.systemUTC());
        assertThrows(com.expresso.backend.career.application.CareerCommandException.class,()->credentials.authenticate(CareerProducerMongoIntegrationTest.sign(claims,CareerProducerMongoIntegrationTest.AI_SECRET)));
        claims.put("audience","career-producer");
        var raw="{\"producer\":\"interview\","+claims.toJson().substring(1);
        var payload=java.util.Base64.getUrlEncoder().withoutPadding().encodeToString(raw.getBytes(java.nio.charset.StandardCharsets.UTF_8));
        var mac=javax.crypto.Mac.getInstance("HmacSHA256"); mac.init(new javax.crypto.spec.SecretKeySpec(CareerProducerMongoIntegrationTest.AI_SECRET.getBytes(java.nio.charset.StandardCharsets.UTF_8),"HmacSHA256"));
        var token="expi."+payload+"."+java.util.Base64.getUrlEncoder().withoutPadding().encodeToString(mac.doFinal(payload.getBytes(java.nio.charset.StandardCharsets.US_ASCII)));
        assertThrows(com.expresso.backend.career.application.CareerCommandException.class,()->credentials.authenticate(token));
    }
    @Test void credentialsRejectSharedOrShortProducerKeys() {
        assertThrows(IllegalArgumentException.class,()->new com.expresso.backend.career.integration.CareerProducerCredentials("short",CareerProducerMongoIntegrationTest.INTERVIEW_SECRET,java.time.Clock.systemUTC()));
        assertThrows(IllegalArgumentException.class,()->new com.expresso.backend.career.integration.CareerProducerCredentials(CareerProducerMongoIntegrationTest.AI_SECRET,CareerProducerMongoIntegrationTest.AI_SECRET,java.time.Clock.systemUTC()));
    }
    @Test void validServiceActorReachesStrictRequestValidationWithoutUserSessionLookup() throws Exception {
        var claims=new Document("producer","ai-proposal").append("userId",CareerProducerMongoIntegrationTest.USER).append("sourceId",CareerProducerMongoIntegrationTest.SOURCE).append("operationId",CareerProducerMongoIntegrationTest.OP).append("fingerprint","a".repeat(64)).append("audience","career-producer").append("expiresAt",Instant.now().plusSeconds(60).toString());
        var token=CareerProducerMongoIntegrationTest.sign(claims,CareerProducerMongoIntegrationTest.AI_SECRET);
        var response=mvc.perform(post(CareerProducerMongoIntegrationTest.PATH).header("Authorization","Bearer "+token).contentType("application/json").content("{}")).andReturn().getResponse();
        assertEquals(400,response.getStatus(),response.getContentAsString());
    }
}

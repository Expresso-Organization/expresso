package com.expresso.backend.career;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import java.nio.charset.StandardCharsets;
import java.time.*;
import java.util.*;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.bson.Document;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.json.JsonMapper;
import com.mongodb.client.MongoClient;
import com.expresso.backend.career.infrastructure.mongo.MongoCareerCommandRepository;

@SpringBootTest(properties={"career.writer.enabled=true","career.property-mutation.enabled=true","spring.main.web-application-type=servlet", "career.writer.mongo-uri=mongodb://127.0.0.1:1","career.writer.database=unused_mock_database", "career.writer.move-secret=disposable-test-secret-at-least-32-bytes", "career.property-mutation.secret=disposable-mutation-secret-at-least-32-bytes"})
@AutoConfigureMockMvc
@org.junit.jupiter.api.extension.ExtendWith(org.springframework.boot.test.system.OutputCaptureExtension.class)
class CareerPropertyMutationAuthenticationTest {
    static final String SECRET="disposable-mutation-secret-at-least-32-bytes", PATH="/internal/career/property-mutations/";
    static final JsonMapper JSON=JsonMapper.builder().build();
    @Autowired MockMvc mvc;
    @MockitoBean MongoClient mongo;
    @MockitoBean MongoCareerCommandRepository repository;
    static Document claims() {return new Document("userId",CareerPropertyMutationMongoIntegrationTest.USER).append("mutationId",CareerPropertyMutationMongoIntegrationTest.JOB).append("recordId",CareerPropertyMutationMongoIntegrationTest.RID).append("operationFingerprint","a".repeat(64)).append("audience","career-property-mutation").append("expiresAt",Instant.now().plusSeconds(60).toString());}
    static String sign(Document claims) throws Exception {return signRaw(JSON.writeValueAsString(claims));}
    static String signRaw(String raw) throws Exception {
        var payload=Base64.getUrlEncoder().withoutPadding().encodeToString(raw.getBytes(StandardCharsets.UTF_8));var mac=Mac.getInstance("HmacSHA256");mac.init(new SecretKeySpec(SECRET.getBytes(StandardCharsets.UTF_8),"HmacSHA256"));
        return "exmi."+payload+"."+Base64.getUrlEncoder().withoutPadding().encodeToString(mac.doFinal(payload.getBytes(StandardCharsets.US_ASCII)));
    }
    @Test void dedicatedServiceCredentialReachesStrictBodyValidationWithoutSessionLookup() throws Exception {
        var response=mvc.perform(post(PATH+"read").header("Authorization","Bearer "+sign(claims())).contentType("application/json").content("{}")).andReturn().getResponse();assertEquals(400,response.getStatus(),response.getContentAsString());
    }
    @Test void rejectsExpiredOverlongWrongAudienceDuplicateAndForeignTokenFamiliesWithoutReflection(org.springframework.boot.test.system.CapturedOutput output) throws Exception {
        var expired=claims().append("expiresAt",Instant.now().minusSeconds(1).toString());var tooLong=claims().append("expiresAt",Instant.now().plusSeconds(301).toString());var audience=claims().append("audience","career-producer");
        var duplicate="{\"userId\":\""+CareerPropertyMutationMongoIntegrationTest.CAT+"\","+JSON.writeValueAsString(claims()).substring(1);
        for(var token:List.of(sign(expired),sign(tooLong),sign(audience),signRaw(duplicate),"exps_"+"A".repeat(43),"expi.payload."+"A".repeat(43),"exmi.payload."+"A".repeat(43))) {
            var response=mvc.perform(post(PATH+"receipt").header("Authorization","Bearer "+token).contentType("application/json").content("{}")).andReturn().getResponse();assertEquals(401,response.getStatus());assertFalse(response.getContentAsString().contains(token));assertFalse(output.getAll().contains(token));
        }
    }
    @Test void rejectsRequestCrossRecordJobFingerprintAndUnexpectedUserIdentity() throws Exception {
        var claims=claims();var body=new Document("mutationId",claims.getString("mutationId")).append("recordId",claims.getString("recordId")).append("operationFingerprint",claims.getString("operationFingerprint"));
        for(var field:List.of("mutationId","recordId","operationFingerprint")) {
            var changed=new Document(body).append(field,field.equals("operationFingerprint")?"b".repeat(64):CareerPropertyMutationMongoIntegrationTest.CAT);
            var response=mvc.perform(post(PATH+"receipt").header("Authorization","Bearer "+sign(claims)).contentType("application/json").content(changed.toJson())).andReturn().getResponse();assertEquals(403,response.getStatus(),response.getContentAsString());
        }
        var response=mvc.perform(post(PATH+"receipt").header("Authorization","Bearer "+sign(claims)).contentType("application/json").content(new Document(body).append("userId",claims.getString("userId")).toJson())).andReturn().getResponse();assertEquals(400,response.getStatus());
    }
    @Test void commitRequiresIfMatchExactlyMatchingExpectedVersion() throws Exception {
        var claims=claims();var body=new Document("mutationId",claims.getString("mutationId")).append("recordId",claims.getString("recordId")).append("operationFingerprint",claims.getString("operationFingerprint")).append("leaseToken",CareerPropertyMutationMongoIntegrationTest.LEASE).append("expectedVersion",1).append("propertyValues",new Document("set",List.of()).append("unsetPropertyIds",List.of()));
        for(var match:List.of("", "\"v2\"", "W/\"v1\"")) {
            var request=post(PATH+"commit").header("Authorization","Bearer "+sign(claims)).contentType("application/json").content(body.toJson());if(!match.isEmpty())request.header("If-Match",match);
            var response=mvc.perform(request).andReturn().getResponse();assertEquals(400,response.getStatus(),response.getContentAsString());
        }
    }
}
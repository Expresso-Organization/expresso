package com.expresso.backend.career;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import java.nio.file.*;
import java.util.*;
import java.util.stream.Stream;
import com.mongodb.*;
import com.mongodb.client.MongoClient;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.json.JsonMapper;
import com.expresso.backend.career.application.*;
import com.expresso.backend.career.infrastructure.mongo.MongoCareerCommandRepository;

@SpringBootTest(properties={"career.writer.enabled=true","spring.main.web-application-type=servlet",
        "career.writer.mongo-uri=mongodb://127.0.0.1:1","career.writer.database=unused_mock_database",
        "career.writer.move-secret=disposable-test-secret-with-at-least-32-bytes"})
@AutoConfigureMockMvc
class CareerAuthenticationFailureTest {
    @Autowired MockMvc mvc;
    @MockitoBean MongoClient mongo;
    @MockitoBean MongoCareerCommandRepository repository;
    static final String TOKEN="exps_"+"A".repeat(43);
    static final String PATH="/v1/career/records";
    static Stream<RuntimeException> infrastructureFailures() {
        return Stream.of(new MongoTimeoutException("lookup timed out"),
                new MongoSocketReadException("socket failed",new ServerAddress("127.0.0.1",1)),
                new IllegalStateException("session repository unavailable"));
    }
    @ParameterizedTest @MethodSource("infrastructureFailures")
    void authenticationInfrastructureErrorsUseTheMvcErrorEnvelope(RuntimeException failure) throws Exception {
        when(repository.authenticate(TOKEN)).thenThrow(failure);
        assertEnvelope("Bearer "+TOKEN,500,"infrastructureFailure");
    }
    @Test void missingAndMalformedBearerKeepTheAuthenticationEnvelope() throws Exception {
        assertEnvelope(null,401,"authenticationFailure");
        assertEnvelope("Basic unsupported",401,"authenticationFailure");
        when(repository.authenticate("bad-token")).thenThrow(new CareerCommandException(401,"UNAUTHENTICATED"));
        assertEnvelope("Bearer bad-token",401,"authenticationFailure");
    }
    @Test void unknownRevokedAndExpiredSessionsKeepTheAuthenticationEnvelope() throws Exception {
        for(var reason:List.of("UNKNOWN_SESSION","REVOKED_SESSION","EXPIRED_SESSION")) {
            doThrow(new CareerCommandException(401,reason)).when(repository).authenticate(TOKEN);
            assertEnvelope("Bearer "+TOKEN,401,"authenticationFailure");
        }
    }
    void assertEnvelope(String authorization,int status,String key) throws Exception {
        var request=post(PATH).header("Idempotency-Key","b1-auth-error-key").contentType("application/json").content("{}");
        if(authorization!=null) request.header("Authorization",authorization);
        var result=mvc.perform(request).andReturn().getResponse();
        assertEquals(status,result.getStatus()); assertTrue(result.getContentType().startsWith("application/json"));
        var json=JsonMapper.builder().build();
        var actual=json.readTree(result.getContentAsString()).get("error");
        var expected=json.readTree(Files.readString(Path.of(System.getProperty("b1RepositoryRoot"),"packages/contracts/openapi/fixtures/career-writer-errors-v1.json"))).get(key).get("error");
        assertEquals(Set.of("code","message","requestId"),new HashSet<>(actual.propertyNames()));
        assertEquals(expected.get("code"),actual.get("code")); assertEquals(expected.get("message"),actual.get("message"));
        assertDoesNotThrow(() -> UUID.fromString(actual.get("requestId").asText()));
        assertFalse(result.getContentAsString().contains("lookup timed out"));
    }
}

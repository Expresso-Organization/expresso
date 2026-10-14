package com.expresso.backend.operations;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.ApplicationContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest(properties={"SPRING_PORT=18473", "MONGODB_URL=mongodb://127.0.0.1:1/?replicaSet=rs0", "MONGODB_DATABASE=expresso_test_operations", "spring.main.web-application-type=servlet"})
@ActiveProfiles("operations")
@AutoConfigureMockMvc
class OperationsHttpTest {
    @Autowired MockMvc mvc;
    @Autowired ApplicationContext context;

    @Test void livenessDoesNotDependOnMongoOrCredentials() throws Exception {
        var response=mvc.perform(get("/health/live").header("Authorization","Bearer invalid-secret")).andReturn().getResponse();
        assertEquals(200,response.getStatus());
        assertEquals("{\"status\":\"ok\"}",response.getContentAsString());
    }
    @Test void unreachableMongoFailsReadinessWithoutSensitiveDetails() throws Exception {
        var response=mvc.perform(get("/health/ready")).andReturn().getResponse();
        assertEquals(503,response.getStatus());
        assertEquals("{\"status\":\"not_ready\",\"checks\":{\"mongodb\":\"down\"}}",response.getContentAsString());
        assertFalse(response.getContentAsString().contains("127.0.0.1"));
    }
    @Test void businessEndpointsAndBeansRemainInactiveByDefault() throws Exception {
        for(var path:new String[]{"/v1/career/records", "/internal/career/integration/business", "/unknown"}) {
            int status=mvc.perform(post(path).contentType("application/json").content("{}")).andReturn().getResponse().getStatus();
            assertTrue(status==401 || status==403, path+": "+status);
        }
        assertEquals(0,context.getBeansOfType(com.expresso.backend.career.http.CareerCommandController.class).size());
        assertEquals(0,context.getBeansOfType(com.expresso.backend.career.integration.CareerProducerBusinessService.class).size());
        assertEquals(0,context.getBeansOfType(com.mongodb.client.MongoClient.class).size());
    }
}

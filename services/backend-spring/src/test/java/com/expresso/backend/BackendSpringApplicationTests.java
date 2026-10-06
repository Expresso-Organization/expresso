package com.expresso.backend;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ApplicationContext;
import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
class BackendSpringApplicationTests {
    @Autowired ApplicationContext context;
    @Test
    void contextLoadsWithoutDatabaseOrHttpServer() {
        assertEquals(0, context.getBeansOfType(com.mongodb.client.MongoClient.class).size());
        assertEquals(0, context.getBeansOfType(com.expresso.backend.career.http.CareerCommandController.class).size());
    }
}

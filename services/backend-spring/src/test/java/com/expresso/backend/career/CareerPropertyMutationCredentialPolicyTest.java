package com.expresso.backend.career;

import static org.junit.jupiter.api.Assertions.*;
import java.time.*;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import com.expresso.backend.career.application.CareerCommandException;
import com.expresso.backend.career.infrastructure.mongo.MongoCareerCommandRepository;
import com.expresso.backend.career.mutation.*;

class CareerPropertyMutationCredentialPolicyTest {
    private ApplicationContextRunner context() {
        return new ApplicationContextRunner().withUserConfiguration(CareerPropertyMutationConfiguration.class).withBean(Clock.class,Clock::systemUTC).withBean(MongoCareerCommandRepository.class,()->org.mockito.Mockito.mock(MongoCareerCommandRepository.class));
    }
    @Test void activationRequiresBothExplicitFlagsAndAnExternalSecret() {
        for(var values:new String[][]{{},{"career.writer.enabled=true"},{"career.property-mutation.enabled=true"},{"career.writer.enabled=true","career.property-mutation.enabled=false"}})
            context().withPropertyValues(values).run(result->{assertNull(result.getStartupFailure());assertEquals(0,result.getBeansOfType(CareerPropertyMutationCredentials.class).size());assertEquals(0,result.getBeansOfType(CareerPropertyMutationHttpService.class).size());});
        context().withPropertyValues("career.writer.enabled=true","career.property-mutation.enabled=true").run(result->assertNotNull(result.getStartupFailure()));
        context().withPropertyValues("career.writer.enabled=true","career.property-mutation.enabled=true","career.property-mutation.secret="+CareerPropertyMutationAuthenticationTest.SECRET).run(result->{assertNull(result.getStartupFailure());assertEquals(1,result.getBeansOfType(CareerPropertyMutationCredentials.class).size());});
    }
    @Test void shortKeysAndProducerKeyReusePreventActivation() {
        assertThrows(IllegalArgumentException.class,()->new CareerPropertyMutationCredentials("short",Clock.systemUTC()));
        for(var setting:new String[]{"career.integration.ai-secret","career.integration.interview-secret"})
            context().withPropertyValues("career.writer.enabled=true","career.property-mutation.enabled=true","career.property-mutation.secret="+CareerPropertyMutationAuthenticationTest.SECRET,setting+"="+CareerPropertyMutationAuthenticationTest.SECRET).run(result->assertNotNull(result.getStartupFailure()));
    }
    @Test void expiryBoundarySignatureAndUnknownClaimsAreRejectedWithoutCredentialDetails() throws Exception {
        var now=Instant.parse("2026-10-09T00:00:00Z");var credentials=new CareerPropertyMutationCredentials(CareerPropertyMutationAuthenticationTest.SECRET,Clock.fixed(now,ZoneOffset.UTC));
        var claims=CareerPropertyMutationAuthenticationTest.claims().append("expiresAt",now.plusSeconds(300).toString());
        assertEquals(CareerPropertyMutationMongoIntegrationTest.RID,credentials.authenticate(CareerPropertyMutationAuthenticationTest.sign(claims)).scope().recordId());
        for(var expiry:new Instant[]{now,now.minusNanos(1),now.plusSeconds(300).plusNanos(1)}) {
            var token=CareerPropertyMutationAuthenticationTest.sign(new org.bson.Document(claims).append("expiresAt",expiry.toString()));var error=assertThrows(CareerCommandException.class,()->credentials.authenticate(token));assertEquals(401,error.status());assertFalse(error.getMessage().contains(token));
        }
        var extra=CareerPropertyMutationAuthenticationTest.sign(new org.bson.Document(claims).append("producer","ai-proposal"));assertThrows(CareerCommandException.class,()->credentials.authenticate(extra));
        var token=CareerPropertyMutationAuthenticationTest.sign(claims);var parts=token.split("\\.");var tampered=parts[0]+"."+parts[1]+"."+(parts[2].startsWith("A")?"B":"A")+parts[2].substring(1);assertThrows(CareerCommandException.class,()->credentials.authenticate(tampered));
    }
}
package com.expresso.backend.career.mutation;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.*;
import java.util.*;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import tools.jackson.core.StreamReadFeature;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.json.JsonMapper;
import com.expresso.backend.career.http.CareerBusinessInput;
import com.expresso.backend.career.application.CareerCommandException;

public final class CareerPropertyMutationCredentials {
    private final byte[] secret;
    private final Clock clock;
    private final JsonMapper json=JsonMapper.builder().enable(StreamReadFeature.STRICT_DUPLICATE_DETECTION).enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS).build();
    public CareerPropertyMutationCredentials(String secret,Clock clock) {
        this.secret=secret.getBytes(StandardCharsets.UTF_8);
        if(this.secret.length<32)throw new IllegalArgumentException("mutation 전용 32바이트 이상의 key가 필요합니다");
        this.clock=Objects.requireNonNull(clock);
    }
    public MutationServiceActor authenticate(String token) {
        try {
            if(token==null||token.length()>4096||!token.matches("exmi\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]{43}"))throw new IllegalArgumentException();
            var parts=token.split("\\.",-1);var encoded=parts[1];var bytes=Base64.getUrlDecoder().decode(encoded);
            if(!Base64.getUrlEncoder().withoutPadding().encodeToString(bytes).equals(encoded))throw new IllegalArgumentException();
            var claims=json.readTree(bytes);var fields=Set.of("userId","mutationId","recordId","operationFingerprint","audience","expiresAt");
            CareerBusinessInput.fields(claims,fields,fields);var scope=CareerPropertyMutationScope.from(claims);
            if(!CareerBusinessInput.text(claims.get("audience")).equals("career-property-mutation"))throw new IllegalArgumentException();
            var expiry=Instant.parse(CareerBusinessInput.text(claims.get("expiresAt")));var now=clock.instant();
            if(!expiry.isAfter(now)||expiry.isAfter(now.plusSeconds(300)))throw new IllegalArgumentException();
            var mac=Mac.getInstance("HmacSHA256");mac.init(new SecretKeySpec(secret,"HmacSHA256"));var signature=Base64.getUrlDecoder().decode(parts[2]);
            if(!Base64.getUrlEncoder().withoutPadding().encodeToString(signature).equals(parts[2])||!MessageDigest.isEqual(mac.doFinal(encoded.getBytes(StandardCharsets.US_ASCII)),signature))throw new IllegalArgumentException();
            return new MutationServiceActor(scope,expiry);
        } catch(Exception error) {throw new CareerCommandException(401,"UNAUTHENTICATED");}
    }
}

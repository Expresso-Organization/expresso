package com.expresso.backend.career.application;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.Base64;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

public final class CareerMoveTokens {
    private final byte[] secret;
    public CareerMoveTokens(String secret) {
        if (secret == null || secret.getBytes(StandardCharsets.UTF_8).length < 32) throw new IllegalArgumentException("move secret은 32 bytes 이상이어야 합니다");
        this.secret = secret.getBytes(StandardCharsets.UTF_8);
    }
    public String sign(String binding, Instant issuedAt) {
        var payload = issuedAt.toEpochMilli() + ":" + binding;
        return encode(payload.getBytes(StandardCharsets.UTF_8)) + "." + encode(mac(payload));
    }
    public Instant verify(String token, String binding, Instant now) {
        try {
            var parts = token.split("\\.", -1);
            if (parts.length != 2) throw new IllegalArgumentException();
            var payload = new String(Base64.getUrlDecoder().decode(parts[0]), StandardCharsets.UTF_8);
            var separator = payload.indexOf(':');
            var issued = Instant.ofEpochMilli(Long.parseLong(payload.substring(0, separator)));
            if (!payload.substring(separator + 1).equals(binding) || issued.isAfter(now)
                    || !issued.plusSeconds(900).isAfter(now)
                    || !MessageDigest.isEqual(mac(payload), Base64.getUrlDecoder().decode(parts[1]))) throw new IllegalArgumentException();
            return issued;
        } catch (RuntimeException exception) {
            throw new CareerCommandException(409, "MOVE_PREVIEW_EXPIRED_OR_CHANGED");
        }
    }
    public static String hash(String value) {
        try { return java.util.HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8))); }
        catch (java.security.NoSuchAlgorithmException exception) { throw new IllegalStateException(exception); }
    }
    private byte[] mac(String payload) {
        try { var mac = Mac.getInstance("HmacSHA256"); mac.init(new SecretKeySpec(secret, "HmacSHA256")); return mac.doFinal(payload.getBytes(StandardCharsets.UTF_8)); }
        catch (java.security.GeneralSecurityException exception) { throw new IllegalStateException(exception); }
    }
    private static String encode(byte[] bytes) { return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes); }
}

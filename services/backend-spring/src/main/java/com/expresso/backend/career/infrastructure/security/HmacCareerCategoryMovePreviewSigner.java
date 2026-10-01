package com.expresso.backend.career.infrastructure.security;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import com.expresso.backend.career.application.CareerCategoryMovePreviewSigner;
import com.expresso.backend.career.application.CareerCategoryMoveToken;

@Component
public final class HmacCareerCategoryMovePreviewSigner implements CareerCategoryMovePreviewSigner {

	private static final Duration VALIDITY = Duration.ofMinutes(15);
	private final byte[] secret;

	public HmacCareerCategoryMovePreviewSigner(@Value("${CAREER_MOVE_PREVIEW_SECRET}") String secret) {
		if (secret == null || secret.length() < 32) {
			throw new IllegalArgumentException("CAREER_MOVE_PREVIEW_SECRET은 32자 이상이어야 합니다");
		}
		this.secret = secret.getBytes(StandardCharsets.UTF_8).clone();
	}

	@Override
	public String sign(CareerCategoryMoveToken token, Instant now) {
		var expiresAt = now.plus(VALIDITY).getEpochSecond();
		var payload = payload(token, expiresAt);
		return encode(payload.getBytes(StandardCharsets.UTF_8)) + "." + encode(mac(payload));
	}

	@Override
	public boolean verify(String signedToken, CareerCategoryMoveToken expected, Instant now) {
		try {
			var parts = signedToken.split("\\.", -1);
			if (parts.length != 2) return false;
			var payload = new String(Base64.getUrlDecoder().decode(parts[0]), StandardCharsets.UTF_8);
			var fields = payload.split("\\|", -1);
			if (fields.length != 9 || now.getEpochSecond() > Long.parseLong(fields[8])) return false;
			if (!payload(expected, Long.parseLong(fields[8])).equals(payload)) return false;
			return MessageDigest.isEqual(Base64.getUrlDecoder().decode(parts[1]), mac(payload));
		}
		catch (RuntimeException exception) {
			return false;
		}
	}

	private static String payload(CareerCategoryMoveToken token, long expiresAt) {
		return String.join("|", token.userId(), token.recordId(), token.sourceCategoryId(), token.targetCategoryId(),
				Long.toString(token.recordVersion()), Long.toString(token.sourceSchemaVersion()),
				Long.toString(token.targetSchemaVersion()), token.planDigest(), Long.toString(expiresAt));
	}

	private byte[] mac(String value) {
		try {
			var mac = Mac.getInstance("HmacSHA256");
			mac.init(new SecretKeySpec(secret, "HmacSHA256"));
			return mac.doFinal(value.getBytes(StandardCharsets.UTF_8));
		}
		catch (Exception exception) {
			throw new IllegalStateException("Category move preview 서명을 만들 수 없습니다", exception);
		}
	}

	private static String encode(byte[] value) {
		return Base64.getUrlEncoder().withoutPadding().encodeToString(value);
	}
}

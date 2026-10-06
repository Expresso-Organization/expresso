package com.expresso.backend.career.application;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.UUID;

final class CareerExactOptionIdentity {

	private CareerExactOptionIdentity() {
	}

	static String from(String propertyDefinitionId, String exactName) {
		try {
			var namespace = UUID.fromString(propertyDefinitionId);
			var bytes = ByteBuffer.allocate(16)
					.putLong(namespace.getMostSignificantBits())
					.putLong(namespace.getLeastSignificantBits())
					.array();
			var digest = MessageDigest.getInstance("SHA-1");
			digest.update(bytes);
			digest.update(exactName.getBytes(StandardCharsets.UTF_8));
			var hash = digest.digest();
			hash[6] = (byte) ((hash[6] & 0x0f) | 0x50);
			hash[8] = (byte) ((hash[8] & 0x3f) | 0x80);
			var buffer = ByteBuffer.wrap(hash);
			return new UUID(buffer.getLong(), buffer.getLong()).toString();
		}
		catch (NoSuchAlgorithmException error) {
			throw new IllegalStateException("SHA-1 해시 알고리즘을 사용할 수 없습니다", error);
		}
	}
}

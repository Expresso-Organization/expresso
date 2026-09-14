package com.expresso.backend.career.application;

import java.time.Instant;
import java.util.Objects;

public record CareerUnmappedPropertyProvenance(
		String sourcePropertyKey,
		String sourcePropertyName,
		long sourcePropertyDefinitionVersion,
		Instant preservedAt,
		long sourceRecordVersion,
		CareerUnmappedPropertyReason reason) {

	public CareerUnmappedPropertyProvenance {
		Objects.requireNonNull(sourcePropertyKey, "sourcePropertyKey는 null일 수 없습니다");
		Objects.requireNonNull(sourcePropertyName, "sourcePropertyName은 null일 수 없습니다");
		Objects.requireNonNull(preservedAt, "preservedAt은 null일 수 없습니다");
		Objects.requireNonNull(reason, "reason은 null일 수 없습니다");
		if (!sourcePropertyKey.matches("^[A-Za-z][A-Za-z0-9_]{0,63}$")) {
			throw new IllegalArgumentException("sourcePropertyKey 형식이 올바르지 않습니다");
		}
		if (sourcePropertyName.isBlank() || sourcePropertyName.length() > 80) {
			throw new IllegalArgumentException("sourcePropertyName은 1자 이상 80자 이하여야 합니다");
		}
		if (sourcePropertyDefinitionVersion < 1 || sourceRecordVersion < 1) {
			throw new IllegalArgumentException("provenance version은 1 이상이어야 합니다");
		}
	}
}

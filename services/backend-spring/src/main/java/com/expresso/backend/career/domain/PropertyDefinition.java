package com.expresso.backend.career.domain;

import java.time.Instant;
import java.util.Map;
import java.util.Objects;

public record PropertyDefinition(
		String id,
		String key,
		String name,
		PropertyDefinitionType type,
		boolean required,
		boolean system,
		Map<String, Object> config,
		int order,
		long version,
		Instant deletedAt) {

	public PropertyDefinition {
		Objects.requireNonNull(id, "PropertyDefinition id는 null일 수 없습니다");
		Objects.requireNonNull(key, "PropertyDefinition key는 null일 수 없습니다");
		Objects.requireNonNull(name, "PropertyDefinition name은 null일 수 없습니다");
		Objects.requireNonNull(type, "PropertyDefinition type은 null일 수 없습니다");
		if (!key.matches("^[A-Za-z][A-Za-z0-9_]{0,63}$")) {
			throw new IllegalArgumentException("PropertyDefinition key 형식이 올바르지 않습니다");
		}
		if (name.isBlank() || name.length() > 80) {
			throw new IllegalArgumentException("PropertyDefinition name은 1자 이상 80자 이하여야 합니다");
		}
		config = CanonicalJsonValues.copyObject(config);
		if (order < 0) {
			throw new IllegalArgumentException("PropertyDefinition order는 0 이상이어야 합니다");
		}
		if (version < 1) {
			throw new IllegalArgumentException("PropertyDefinition version은 1 이상이어야 합니다");
		}
	}
}

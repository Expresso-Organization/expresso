package com.expresso.backend.career.application;

import java.util.Map;

import com.expresso.backend.career.domain.PropertyDefinitionType;

public record CareerPropertyCreateChange(
		String id,
		String key,
		String name,
		PropertyDefinitionType type,
		Map<String, Object> config,
		Integer order) implements CareerPropertySchemaChange {
}

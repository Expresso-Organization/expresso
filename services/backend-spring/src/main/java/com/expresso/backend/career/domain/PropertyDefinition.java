package com.expresso.backend.career.domain;

public record PropertyDefinition(
		String id,
		String key,
		String label,
		PropertyDefinitionType type,
		boolean required,
		boolean system) {
}

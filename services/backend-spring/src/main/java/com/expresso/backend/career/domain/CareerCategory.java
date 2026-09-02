package com.expresso.backend.career.domain;

import java.util.List;

public record CareerCategory(
		String id,
		String key,
		String name,
		List<PropertyDefinition> propertyDefinitions) {

	public CareerCategory {
		propertyDefinitions = List.copyOf(propertyDefinitions);
	}

}

package com.expresso.backend.career.application;

import java.util.List;
import java.util.Map;

import com.expresso.backend.career.domain.PropertyDefinition;

public record CareerPropertyCategorySnapshot(
		String id,
		String userId,
		String key,
		String name,
		String icon,
		String defaultView,
		boolean system,
		Map<String, Object> propertySchema,
		List<CareerPropertyDefinitionV2Snapshot> propertySchemaV2,
		List<PropertyDefinition> propertyDefinitions,
		long schemaVersion,
		int sortOrder,
		long version) {
}

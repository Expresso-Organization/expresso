package com.expresso.backend.career.application;

import java.util.List;
import java.util.Map;

public record CareerCategoryMovePreview(
		String recordId,
		String sourceCategoryId,
		String targetCategoryId,
		long recordVersion,
		long sourceSchemaVersion,
		long targetSchemaVersion,
		List<CareerPropertyConversion> conversions,
		Map<String, CareerUnmappedPropertyEnvelope> unmappedProperties,
		String previewToken) {
	public CareerCategoryMovePreview {
		conversions = List.copyOf(conversions);
		unmappedProperties = Map.copyOf(unmappedProperties);
	}
}

package com.expresso.backend.career.application;

import java.util.List;
import java.util.Map;

import com.expresso.backend.career.domain.PropertyValue;

public record CareerCategoryMovePlan(
		List<PropertyValue> propertyValues,
		CareerUnmappedProperties unmapped,
		List<CareerPropertyConversion> conversions,
		List<String> computationPropertyIds,
		Map<String, Long> targetPropertyVersions) {

	public CareerCategoryMovePlan {
		propertyValues = List.copyOf(propertyValues);
		conversions = List.copyOf(conversions);
		computationPropertyIds = List.copyOf(computationPropertyIds);
		targetPropertyVersions = Map.copyOf(targetPropertyVersions);
	}

	public Map<String, CareerUnmappedPropertyEnvelope> unmappedProperties() {
		return unmapped.values();
	}
}

package com.expresso.backend.career.application;

import java.util.Map;

import com.expresso.backend.career.domain.CareerRecord;

public record CareerCategoryMoveRecordSnapshot(
		CareerRecord record,
		Map<String, CareerUnmappedPropertyEnvelope> unmappedProperties) {
	public CareerCategoryMoveRecordSnapshot {
		unmappedProperties = Map.copyOf(unmappedProperties);
	}
}

package com.expresso.backend.career.application;

import java.util.Objects;
import java.util.UUID;

import com.expresso.backend.career.domain.PropertyValue;

public record CareerUnmappedPropertyEnvelope(
		String sourceCategoryId,
		PropertyValue propertyValue,
		CareerUnmappedPropertyProvenance provenance) {

	public CareerUnmappedPropertyEnvelope {
		Objects.requireNonNull(sourceCategoryId, "sourceCategoryId는 null일 수 없습니다");
		try {
			if (!UUID.fromString(sourceCategoryId).toString().equalsIgnoreCase(sourceCategoryId)) {
				throw new IllegalArgumentException("sourceCategoryId는 올바른 UUID여야 합니다");
			}
		}
		catch (IllegalArgumentException exception) {
			throw new IllegalArgumentException("sourceCategoryId는 올바른 UUID여야 합니다", exception);
		}
		Objects.requireNonNull(propertyValue, "propertyValue는 null일 수 없습니다");
		Objects.requireNonNull(provenance, "provenance는 null일 수 없습니다");
	}
}

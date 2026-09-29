package com.expresso.backend.career.application;

import java.util.List;
import java.util.Map;
import java.util.Objects;

import com.expresso.backend.career.domain.PropertyValue;

public record CreateCareerRecordCommand(
		String categoryId,
		String title,
		List<PropertyValue> propertyValues,
		Map<String, Object> compatibilityProperties,
		String bodyMd,
		Mode mode) {

	public enum Mode {
		EMPTY,
		GROUPED,
		DUPLICATE
	}

	public CreateCareerRecordCommand {
		Objects.requireNonNull(categoryId, "categoryId는 null일 수 없습니다");
		Objects.requireNonNull(title, "title은 null일 수 없습니다");
		propertyValues = List.copyOf(Objects.requireNonNull(propertyValues, "propertyValues는 null일 수 없습니다"));
		compatibilityProperties = Map.copyOf(Objects.requireNonNull(
				compatibilityProperties, "compatibilityProperties는 null일 수 없습니다"));
		Objects.requireNonNull(bodyMd, "bodyMd는 null일 수 없습니다");
		Objects.requireNonNull(mode, "mode는 null일 수 없습니다");
	}
}

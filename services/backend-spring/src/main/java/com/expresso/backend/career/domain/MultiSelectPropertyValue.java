package com.expresso.backend.career.domain;

import java.util.List;
import java.util.Objects;

public record MultiSelectPropertyValue(String propertyDefinitionId, List<String> value) implements PropertyValue {

	private static final int MAX_OPTIONS = 100;

	public MultiSelectPropertyValue {
		propertyDefinitionId = PropertyValue.requirePropertyDefinitionId(propertyDefinitionId);
		value = List.copyOf(Objects.requireNonNull(value, "value는 null일 수 없습니다"));
		if (value.size() > MAX_OPTIONS) {
			throw new IllegalArgumentException("multi_select value는 최대 100개까지 허용됩니다");
		}
		for (var optionId : value) {
			PropertyValue.requireUuid(optionId, "multi_select option id");
		}
	}

	@Override
	public PropertyValueType type() {
		return PropertyValueType.MULTI_SELECT;
	}
}

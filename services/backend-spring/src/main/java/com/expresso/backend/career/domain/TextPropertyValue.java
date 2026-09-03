package com.expresso.backend.career.domain;

import java.util.Objects;

public record TextPropertyValue(String propertyDefinitionId, String value) {

	private static final int MAX_VALUE_LENGTH = 5_000;

	public TextPropertyValue {
		Objects.requireNonNull(propertyDefinitionId, "propertyDefinitionId는 null일 수 없습니다");
		Objects.requireNonNull(value, "value는 null일 수 없습니다");
		if (value.codePointCount(0, value.length()) > MAX_VALUE_LENGTH) {
			throw new IllegalArgumentException("value는 5000자를 초과할 수 없습니다");
		}
	}

}

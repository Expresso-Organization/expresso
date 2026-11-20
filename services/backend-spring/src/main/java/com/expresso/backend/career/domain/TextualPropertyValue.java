package com.expresso.backend.career.domain;

import java.util.EnumSet;
import java.util.Objects;

public record TextualPropertyValue(
		String propertyDefinitionId,
		PropertyValueType type,
		String value) implements PropertyValue {

	private static final int MAX_TEXT_LENGTH = 50_000;
	private static final int MAX_SPECIALIZED_TEXT_LENGTH = 2_000;
	private static final EnumSet<PropertyValueType> SUPPORTED_TYPES = EnumSet.of(
			PropertyValueType.TEXT,
			PropertyValueType.URL,
			PropertyValueType.EMAIL,
			PropertyValueType.PHONE);

	public TextualPropertyValue {
		propertyDefinitionId = PropertyValue.requirePropertyDefinitionId(propertyDefinitionId);
		Objects.requireNonNull(type, "PropertyValue type은 null일 수 없습니다");
		Objects.requireNonNull(value, "value는 null일 수 없습니다");
		if (!SUPPORTED_TYPES.contains(type)) {
			throw new IllegalArgumentException("문자열 값에 사용할 수 없는 PropertyValue type입니다: " + type);
		}
		var maximumLength = type == PropertyValueType.TEXT
				? MAX_TEXT_LENGTH
				: MAX_SPECIALIZED_TEXT_LENGTH;
		if (value.codePointCount(0, value.length()) > maximumLength) {
			throw new IllegalArgumentException("value는 " + maximumLength + "자를 초과할 수 없습니다");
		}
	}
}

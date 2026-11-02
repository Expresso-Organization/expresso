package com.expresso.backend.career.domain;

import java.util.Objects;
import java.util.UUID;

public sealed interface PropertyValue permits TextualPropertyValue, NumberPropertyValue,
		CheckboxPropertyValue, SelectPropertyValue, MultiSelectPropertyValue,
		DatePropertyValue, AssetPropertyValue {

	String propertyDefinitionId();

	PropertyValueType type();

	static String requireUuid(String value, String fieldName) {
		Objects.requireNonNull(value, fieldName + "는 null일 수 없습니다");
		try {
			var uuid = UUID.fromString(value);
			boolean standard = uuid.version() >= 1 && uuid.version() <= 8 && uuid.variant() == 2;
			boolean nil = uuid.getMostSignificantBits() == 0 && uuid.getLeastSignificantBits() == 0;
			boolean maximum = uuid.getMostSignificantBits() == -1 && uuid.getLeastSignificantBits() == -1;
			if (!uuid.toString().equalsIgnoreCase(value) || !(standard || nil || maximum)) {
				throw new IllegalArgumentException(fieldName + "는 올바른 UUID여야 합니다");
			}
			return value;
		}
		catch (IllegalArgumentException exception) {
			throw new IllegalArgumentException(fieldName + "는 올바른 UUID여야 합니다", exception);
		}
	}

	static String requirePropertyDefinitionId(String propertyDefinitionId) {
		return requireUuid(propertyDefinitionId, "propertyDefinitionId");
	}
}

package com.expresso.backend.career.domain;

import java.math.BigDecimal;
import java.util.Objects;

public record NumberPropertyValue(String propertyDefinitionId, BigDecimal value) implements PropertyValue {

	public NumberPropertyValue {
		propertyDefinitionId = PropertyValue.requirePropertyDefinitionId(propertyDefinitionId);
		Objects.requireNonNull(value, "value는 null일 수 없습니다");
		value = value.signum() == 0 ? BigDecimal.ZERO : value.stripTrailingZeros();
	}

	@Override
	public PropertyValueType type() {
		return PropertyValueType.NUMBER;
	}
}

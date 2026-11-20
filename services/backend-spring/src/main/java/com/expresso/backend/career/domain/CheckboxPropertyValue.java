package com.expresso.backend.career.domain;

public record CheckboxPropertyValue(String propertyDefinitionId, boolean value) implements PropertyValue {

	public CheckboxPropertyValue {
		propertyDefinitionId = PropertyValue.requirePropertyDefinitionId(propertyDefinitionId);
	}

	@Override
	public PropertyValueType type() {
		return PropertyValueType.CHECKBOX;
	}
}

package com.expresso.backend.career.domain;

public record SelectPropertyValue(String propertyDefinitionId, String value) implements PropertyValue {

	public SelectPropertyValue {
		propertyDefinitionId = PropertyValue.requirePropertyDefinitionId(propertyDefinitionId);
		if (value != null) {
			value = PropertyValue.requireUuid(value, "select option id");
		}
	}

	@Override
	public PropertyValueType type() {
		return PropertyValueType.SELECT;
	}
}

package com.expresso.backend.career.domain;

import java.util.List;
import java.util.Objects;

public record CareerCategory(
		String id,
		String key,
		String name,
		List<PropertyDefinition> propertyDefinitions) {

	public CareerCategory {
		Objects.requireNonNull(id, "CareerCategory id는 null일 수 없습니다");
		Objects.requireNonNull(key, "CareerCategory key는 null일 수 없습니다");
		Objects.requireNonNull(name, "CareerCategory name은 null일 수 없습니다");
		Objects.requireNonNull(propertyDefinitions, "propertyDefinitions는 null일 수 없습니다");
		propertyDefinitions = List.copyOf(propertyDefinitions);
	}

}

package com.expresso.backend.career.domain;

import java.util.List;
import java.util.HashSet;
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
        var ids = new HashSet<String>();
        var keys = new HashSet<String>();
        // 삭제된 정의도 ID와 key를 예약하며 표시 이름은 제한하지 않습니다.
        for (var definition : propertyDefinitions) {
            if (!ids.add(definition.id()) || !keys.add(definition.key())) {
                throw new IllegalArgumentException("DUPLICATE_CANONICAL_DEFINITION");
            }
        }
	}

}

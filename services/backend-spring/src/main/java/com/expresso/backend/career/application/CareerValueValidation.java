package com.expresso.backend.career.application;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import com.expresso.backend.career.domain.*;

public final class CareerValueValidation {
    private CareerValueValidation() {}
    public static void validate(CareerCategory category, List<PropertyValue> values) {
        var definitions = category.propertyDefinitions().stream().filter(d -> d.deletedAt() == null)
                .collect(Collectors.toMap(PropertyDefinition::id, d -> d));
        for (var value : values) {
            var definition = definitions.get(value.propertyDefinitionId());
            if (definition == null || !definition.type().writable()
                    || !definition.type().wireName().equals(value.type().wireName())) {
                throw new IllegalArgumentException("category의 활성 writable definition과 값이 일치하지 않습니다");
            }
            List<String> ids = value instanceof SelectPropertyValue select
                    ? select.value() == null ? List.of() : List.of(select.value())
                    : value instanceof MultiSelectPropertyValue multi ? multi.value() : List.of();
            if (!ids.isEmpty()) {
                var raw = definition.config().get("options");
                if (!(raw instanceof List<?> options)) throw new IllegalArgumentException("options가 없습니다");
                var allowed = options.stream().map(item -> ((Map<?, ?>) item).get("id")).collect(Collectors.toSet());
                if (!allowed.containsAll(ids)) throw new IllegalArgumentException("정의에 없는 option ID입니다");
            }
        }
    }
}

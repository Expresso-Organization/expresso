package com.expresso.backend.career.domain;

import java.util.EnumSet;
import java.util.List;
import java.util.Objects;

public record AssetPropertyValue(
		String propertyDefinitionId,
		PropertyValueType type,
		List<String> value) implements PropertyValue {

	private static final int MAX_ASSETS = 100;
	private static final EnumSet<PropertyValueType> SUPPORTED_TYPES = EnumSet.of(
			PropertyValueType.FILE,
			PropertyValueType.MEDIA);

	public AssetPropertyValue {
		propertyDefinitionId = PropertyValue.requirePropertyDefinitionId(propertyDefinitionId);
		Objects.requireNonNull(type, "PropertyValue type은 null일 수 없습니다");
		value = List.copyOf(Objects.requireNonNull(value, "value는 null일 수 없습니다"));
		if (!SUPPORTED_TYPES.contains(type)) {
			throw new IllegalArgumentException("asset 목록에 사용할 수 없는 PropertyValue type입니다: " + type);
		}
		if (value.size() > MAX_ASSETS) {
			throw new IllegalArgumentException("asset value는 최대 100개까지 허용됩니다");
		}
		for (var assetId : value) {
			PropertyValue.requireUuid(assetId, "asset id");
		}
	}
}

package com.expresso.backend.career.domain;

import java.time.Instant;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;

public record CareerRecord(
		String id,
		String ownerId,
		String categoryId,
		String title,
		List<PropertyValue> propertyValues,
		BlockBody blockBody,
		long version,
		Instant updatedAt) {

	private static final int MAX_TITLE_LENGTH = 300;
	private static final int MAX_PROPERTY_VALUES = 50;

	public CareerRecord {
		Objects.requireNonNull(id, "id는 null일 수 없습니다");
		Objects.requireNonNull(ownerId, "ownerId는 null일 수 없습니다");
		Objects.requireNonNull(categoryId, "categoryId는 null일 수 없습니다");
		validateTitle(title);
		propertyValues = validatePropertyValues(propertyValues);
		Objects.requireNonNull(blockBody, "blockBody는 null일 수 없습니다");
		if (version < 1) {
			throw new IllegalArgumentException("version은 1 이상이어야 합니다");
		}
		Objects.requireNonNull(updatedAt, "updatedAt은 null일 수 없습니다");
	}

	public static CareerRecord create(
			String id,
			String ownerId,
			String categoryId,
			String emptyParagraphId,
			Instant now) {
		return new CareerRecord(
				id,
				ownerId,
				categoryId,
				"",
				List.of(),
				BlockBody.empty(emptyParagraphId),
				1,
				now);
	}

	public CareerRecord apply(CareerRecordChangeSet changeSet, Instant changedAt) {
		Objects.requireNonNull(changeSet, "changeSet은 null일 수 없습니다");
		Objects.requireNonNull(changedAt, "changedAt은 null일 수 없습니다");

		var nextTitle = changeSet.title().orElse(title);
		var nextPropertyValues = changeSet.propertyValues().orElse(propertyValues);
		var nextBlockBody = changeSet.blockBody().orElse(blockBody);

		validateTitle(nextTitle);
		nextPropertyValues = validatePropertyValues(nextPropertyValues);
		Objects.requireNonNull(nextBlockBody, "blockBody는 null일 수 없습니다");

		if (title.equals(nextTitle)
				&& propertyValues.equals(nextPropertyValues)
				&& blockBody.equals(nextBlockBody)) {
			return this;
		}

		return new CareerRecord(
				id,
				ownerId,
				categoryId,
				nextTitle,
				nextPropertyValues,
				nextBlockBody,
				Math.addExact(version, 1),
				changedAt);
	}

	private static void validateTitle(String title) {
		Objects.requireNonNull(title, "title은 null일 수 없습니다");
		if (title.codePointCount(0, title.length()) > MAX_TITLE_LENGTH) {
			throw new IllegalArgumentException("title은 300자를 초과할 수 없습니다");
		}
	}

	private static List<PropertyValue> validatePropertyValues(List<PropertyValue> propertyValues) {
		var values = List.copyOf(Objects.requireNonNull(propertyValues, "propertyValues는 null일 수 없습니다"));
		if (values.size() > MAX_PROPERTY_VALUES) {
			throw new IllegalArgumentException("propertyValues는 최대 50개까지 허용됩니다");
		}
		var definitionIds = new HashSet<String>();
		for (var value : values) {
			if (!definitionIds.add(value.propertyDefinitionId())) {
				throw new IllegalArgumentException("같은 propertyDefinitionId를 중복해서 사용할 수 없습니다");
			}
		}
		return values;
	}

}

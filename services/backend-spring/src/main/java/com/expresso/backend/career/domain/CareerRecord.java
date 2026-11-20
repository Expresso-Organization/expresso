package com.expresso.backend.career.domain;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;

public record CareerRecord(
        String id,
        String userId,
        String categoryId,
        String title,
        List<PropertyValue> propertyValues,
        CareerRecordStatus status,
        long version,
        Instant updatedAt) {

    // JavaScript number로 표현되는 business 계약의 정수 상한입니다.
    public static final long MAX_VERSION = 9_007_199_254_740_991L;

    public CareerRecord {
        id = PropertyValue.requireUuid(id, "id");
        userId = PropertyValue.requireUuid(userId, "userId");
        categoryId = PropertyValue.requireUuid(categoryId, "categoryId");
        validateTitle(title);
        propertyValues = validatePropertyValues(propertyValues);
        Objects.requireNonNull(status, "status는 null일 수 없습니다");
        if (version < 1 || version > MAX_VERSION) {
            throw new IllegalArgumentException("version은 1 이상 MAX_VERSION 이하여야 합니다");
        }
        updatedAt = Objects.requireNonNull(updatedAt, "updatedAt은 null일 수 없습니다").truncatedTo(ChronoUnit.MILLIS);
    }

    public static CareerRecord create(String id, String userId, String categoryId, Instant now) {
        return new CareerRecord(id, userId, categoryId, "", List.of(), CareerRecordStatus.DRAFT, 1, now);
    }

    public CareerRecord apply(CareerRecordChangeSet changeSet, Instant changedAt) {
        Objects.requireNonNull(changeSet, "changeSet은 null일 수 없습니다");
        Objects.requireNonNull(changedAt, "changedAt은 null일 수 없습니다");
        var nextTitle = changeSet.title().orElse(title);
        var nextValues = changeSet.propertyValues().orElse(propertyValues);
        var nextStatus = changeSet.status().orElse(status);
        validateTitle(nextTitle);
        nextValues = validatePropertyValues(nextValues);
        if (title.equals(nextTitle) && propertyValues.equals(nextValues) && status == nextStatus) return this;
        if (version == MAX_VERSION) {
            throw new IllegalStateException("version 상한에 도달해 business 변경을 적용할 수 없습니다");
        }
        return new CareerRecord(id, userId, categoryId, nextTitle, nextValues, nextStatus,
                Math.addExact(version, 1), changedAt);
    }

    private static void validateTitle(String title) {
        Objects.requireNonNull(title, "title은 null일 수 없습니다");
        if (title.codePointCount(0, title.length()) > 300) {
            throw new IllegalArgumentException("title은 300자를 초과할 수 없습니다");
        }
    }

    private static List<PropertyValue> validatePropertyValues(List<PropertyValue> propertyValues) {
        var values = List.copyOf(Objects.requireNonNull(propertyValues, "propertyValues는 null일 수 없습니다"));
        if (values.size() > 50) throw new IllegalArgumentException("propertyValues는 최대 50개까지 허용됩니다");
        var ids = new HashSet<String>();
        for (var value : values) {
            if (!ids.add(value.propertyDefinitionId())) {
                throw new IllegalArgumentException("같은 propertyDefinitionId를 중복해서 사용할 수 없습니다");
            }
        }
        return values;
    }
}

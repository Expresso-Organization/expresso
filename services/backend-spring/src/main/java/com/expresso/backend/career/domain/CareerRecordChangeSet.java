package com.expresso.backend.career.domain;

import java.util.List;
import java.util.Objects;
import java.util.Optional;

public record CareerRecordChangeSet(
        Optional<String> title,
        Optional<List<PropertyValue>> propertyValues,
        Optional<CareerRecordStatus> status) {

    public CareerRecordChangeSet {
        title = Objects.requireNonNull(title, "title 변경은 null일 수 없습니다");
        propertyValues = Objects.requireNonNull(propertyValues, "propertyValues 변경은 null일 수 없습니다")
                .map(List::copyOf);
        status = Objects.requireNonNull(status, "status 변경은 null일 수 없습니다");
    }

    public static CareerRecordChangeSet none() {
        return new CareerRecordChangeSet(Optional.empty(), Optional.empty(), Optional.empty());
    }

    public CareerRecordChangeSet withTitle(String nextTitle) {
        return new CareerRecordChangeSet(Optional.of(nextTitle), propertyValues, status);
    }

    public CareerRecordChangeSet withPropertyValues(List<? extends PropertyValue> nextValues) {
        return new CareerRecordChangeSet(title, Optional.of(List.copyOf(nextValues)), status);
    }

    public CareerRecordChangeSet withStatus(CareerRecordStatus nextStatus) {
        return new CareerRecordChangeSet(title, propertyValues, Optional.of(nextStatus));
    }
}

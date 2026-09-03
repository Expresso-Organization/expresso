package com.expresso.backend.career.domain;

import java.util.List;
import java.util.Objects;
import java.util.Optional;

public record CareerRecordChangeSet(
		Optional<String> title,
		Optional<List<TextPropertyValue>> propertyValues,
		Optional<BlockBody> blockBody) {

	public CareerRecordChangeSet {
		title = Objects.requireNonNull(title, "title 변경은 null일 수 없습니다");
		propertyValues = Objects.requireNonNull(propertyValues, "propertyValues 변경은 null일 수 없습니다")
				.map(List::copyOf);
		blockBody = Objects.requireNonNull(blockBody, "blockBody 변경은 null일 수 없습니다");
	}

	public static CareerRecordChangeSet none() {
		return new CareerRecordChangeSet(Optional.empty(), Optional.empty(), Optional.empty());
	}

	public CareerRecordChangeSet withTitle(String nextTitle) {
		return new CareerRecordChangeSet(Optional.of(nextTitle), propertyValues, blockBody);
	}

	public CareerRecordChangeSet withPropertyValues(List<TextPropertyValue> nextPropertyValues) {
		return new CareerRecordChangeSet(title, Optional.of(nextPropertyValues), blockBody);
	}

	public CareerRecordChangeSet withBlockBody(BlockBody nextBlockBody) {
		return new CareerRecordChangeSet(title, propertyValues, Optional.of(nextBlockBody));
	}

}

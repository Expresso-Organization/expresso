package com.expresso.backend.career.application;

import java.time.Instant;
import java.util.Optional;

import com.expresso.backend.career.domain.CareerRecord;

public interface CareerCategoryMoveRepository {

	Optional<CareerCategoryMoveRecordSnapshot> findOwnedRecord(String userId, String recordId);

	Optional<CareerCategoryMoveCategorySnapshot> findReadableCategory(String userId, String categoryId);

	Optional<CareerRecord> move(
			CareerCategoryMoveRecordSnapshot current,
			String targetCategoryId,
			CareerCategoryMovePlan plan,
			CareerUnmappedProperties unmapped,
			Instant changedAt);
}

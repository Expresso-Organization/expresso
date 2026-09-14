package com.expresso.backend.career.application;

import java.time.Instant;
import java.util.Optional;

import com.expresso.backend.career.domain.CareerRecord;

public interface CareerRecordLifecycleRepository {

	Optional<CareerRecordTrashResult> trashOwnedCanonical(
			CareerRecord currentRecord,
			Instant deletedAt,
			Instant purgeAfter);

	Optional<RestorableCareerRecord> findOwnedRestorableCanonicalById(
			String ownerId,
			String recordId,
			Instant now);

	Optional<CareerRecord> restoreOwnedCanonical(RestorableCareerRecord current, Instant restoredAt);

	record RestorableCareerRecord(
			CareerRecord record,
			Instant deletedAt,
			Instant purgeAfter,
			Long referenceVersion) {
	}
}

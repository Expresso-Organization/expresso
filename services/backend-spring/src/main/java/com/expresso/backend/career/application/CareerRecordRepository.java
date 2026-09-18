package com.expresso.backend.career.application;

import java.util.Optional;

import com.expresso.backend.career.domain.CareerRecord;
import com.expresso.backend.career.domain.CareerRecordStatus;

public interface CareerRecordRepository {

	CreateResult createOrReplay(CareerRecord newRecord, String idempotencyKey, String requestHash);

	Optional<CareerRecord> findOwnedCanonicalById(String ownerId, String recordId);

	Optional<CareerRecord> updateOwnedCanonical(CareerRecord currentRecord, CareerRecord updatedRecord);

	Optional<CareerRecord> updateOwnedStatus(
			CareerRecord currentRecord,
			CareerRecordStatus status,
			java.time.Instant changedAt);

	record CreateResult(CareerRecord record, boolean created) {
	}

}

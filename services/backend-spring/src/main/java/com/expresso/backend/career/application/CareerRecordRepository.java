package com.expresso.backend.career.application;

import java.util.Optional;
import java.util.Map;

import com.expresso.backend.career.domain.CareerRecord;
import com.expresso.backend.career.domain.CareerRecordStatus;

public interface CareerRecordRepository {

	CreateResult createOrReplay(CareerRecord newRecord, String idempotencyKey, String requestHash);

	default CreateResult createOrReplay(
			CareerRecord newRecord,
			String idempotencyKey,
			String requestHash,
			Map<String, Object> legacyProperties) {
		return createOrReplay(newRecord, idempotencyKey, requestHash);
	}

	default CreateResult createOrReplay(
			CareerRecord newRecord,
			String idempotencyKey,
			String requestHash,
			Map<String, Object> legacyProperties,
			String bodyMd) {
		return createOrReplay(newRecord, idempotencyKey, requestHash, legacyProperties);
	}

	Optional<CareerRecord> findOwnedCanonicalById(String ownerId, String recordId);

	Optional<CareerRecord> updateOwnedCanonical(CareerRecord currentRecord, CareerRecord updatedRecord);

	Optional<CareerRecord> updateOwnedStatus(
			CareerRecord currentRecord,
			CareerRecordStatus status,
			java.time.Instant changedAt);

	record CreateResult(CareerRecord record, boolean created) {
	}

}

package com.expresso.backend.career.application;

import java.util.Optional;

import com.expresso.backend.career.domain.CareerRecord;

public interface CareerRecordRepository {

	CreateResult createOrReplay(CareerRecord newRecord, String idempotencyKey, String requestHash);

	Optional<CareerRecord> findOwnedCanonicalById(String ownerId, String recordId);

	record CreateResult(CareerRecord record, boolean created) {
	}

}

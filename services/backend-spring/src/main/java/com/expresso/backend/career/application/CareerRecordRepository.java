package com.expresso.backend.career.application;

import com.expresso.backend.career.domain.CareerRecord;

public interface CareerRecordRepository {

	CreateResult createOrReplay(CareerRecord newRecord, String idempotencyKey, String requestHash);

	record CreateResult(CareerRecord record, boolean created) {
	}

}

package com.expresso.backend.career.application;

import com.expresso.backend.career.domain.CareerRecord;

public interface CreateCareerRecordUseCase {

	CreateCareerRecordResult create(String ownerId, String categoryId, String idempotencyKey);

	record CreateCareerRecordResult(CareerRecord record, boolean created) {
	}

}

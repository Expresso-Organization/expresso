package com.expresso.backend.career.application;

import com.expresso.backend.career.domain.CareerRecord;
import com.expresso.backend.career.domain.PropertyValue;

import java.util.List;

public interface CreateCareerRecordUseCase {

	CreateCareerRecordResult create(String ownerId, CreateCareerRecordCommand command, String idempotencyKey);

	record CreateCareerRecordResult(CareerRecord record, boolean created) {
	}

}

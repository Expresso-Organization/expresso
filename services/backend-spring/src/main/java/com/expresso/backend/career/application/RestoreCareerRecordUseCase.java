package com.expresso.backend.career.application;

import com.expresso.backend.career.domain.CareerRecord;

public interface RestoreCareerRecordUseCase {

	CareerRecord restore(String ownerId, String recordId, long expectedVersion);
}

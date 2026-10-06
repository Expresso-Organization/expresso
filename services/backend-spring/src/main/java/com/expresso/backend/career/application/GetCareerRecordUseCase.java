package com.expresso.backend.career.application;

import com.expresso.backend.career.domain.CareerRecord;

public interface GetCareerRecordUseCase {

	CareerRecord get(String ownerId, String recordId);

}

package com.expresso.backend.career.application;

import com.expresso.backend.career.domain.CareerRecord;
import com.expresso.backend.career.domain.CareerRecordChangeSet;

public interface PatchCareerRecordUseCase {

	CareerRecord patch(String ownerId, String recordId, long expectedVersion, CareerRecordChangeSet changeSet);

}

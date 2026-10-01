package com.expresso.backend.career.application;

import com.expresso.backend.career.domain.CareerRecord;
import com.expresso.backend.career.domain.CareerRecordChangeSet;
import com.expresso.backend.career.domain.CareerRecordStatus;

public interface PatchCareerRecordUseCase {

	CareerRecord patch(String ownerId, String recordId, long expectedVersion, CareerRecordChangeSet changeSet);

	CareerRecord patchStatus(String ownerId, String recordId, long expectedVersion, CareerRecordStatus status);

}

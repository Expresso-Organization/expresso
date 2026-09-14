package com.expresso.backend.career.application;

import java.time.Instant;
import java.util.List;

import com.expresso.backend.career.domain.CareerRecord;

public interface CareerRecordListRepository {

	List<CareerRecord> findOwnedCanonicalPage(
			String ownerId,
			String categoryId,
			Instant beforeUpdatedAt,
			String beforeRecordId,
			int limit);
}

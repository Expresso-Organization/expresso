package com.expresso.backend.career.application;

import java.util.List;

import com.expresso.backend.career.domain.CareerRecord;

public interface ReplaceCareerRelationTargetsUseCase {

	CareerRecord replace(
			String userId,
			String recordId,
			String propertyId,
			List<String> targetIds,
			long expectedVersion);
}

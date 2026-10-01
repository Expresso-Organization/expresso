package com.expresso.backend.career.application;

import java.time.Instant;
import java.util.List;

import com.expresso.backend.career.domain.CareerRecord;

public interface CareerRelationRepository {

	Replacement replaceTargets(
			String userId,
			String recordId,
			String propertyId,
			List<String> targetIds,
			long expectedVersion,
			Instant changedAt);

	record Replacement(CareerRecord record, List<CareerComputationEvent> computationEvents) {
		public Replacement {
			computationEvents = List.copyOf(computationEvents);
		}
	}
}

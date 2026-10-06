package com.expresso.backend.career.application;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

public interface CareerPropertyDefinitionCreateRepository {
	record ActiveRecord(String id, long version) { }

	Optional<CareerPropertyCategorySnapshot> findOwnedCustomCategory(String userId, String categoryId);

	Optional<CareerPropertyCategorySnapshot> findAccessibleCategory(String userId, String categoryId);

	Optional<CareerPropertyMutationResult> findMutationResult(
			String userId, String categoryId, String idempotencyDigest);

	long countActiveRecordsWithLegacyProperty(
			String userId, String categoryId, String propertyKey);

	List<String> findDependentViewIds(
			String userId, String categoryId, String propertyId);

	List<ActiveRecord> findActiveRecords(String userId, String categoryId, int limit);

	boolean saveMutation(
			String userId,
			long expectedVersion,
			CareerPropertyCategorySnapshot category,
			String idempotencyDigest,
			String requestHash,
			Instant changedAt);
}

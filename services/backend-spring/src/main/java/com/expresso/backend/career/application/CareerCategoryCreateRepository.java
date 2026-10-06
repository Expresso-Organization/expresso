package com.expresso.backend.career.application;

import java.time.Instant;

public interface CareerCategoryCreateRepository {

	long countOwnedCustomCategories(String userId);

	boolean existsOwnedCategoryKey(String userId, String key);

	void insert(CareerPropertyCategorySnapshot category, Instant updatedAt);
}

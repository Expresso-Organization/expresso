package com.expresso.backend.career.application;

import java.util.List;
import java.util.Optional;
import java.util.Map;

import com.expresso.backend.career.domain.CareerCategory;

public interface CareerCategoryRepository {

	List<CareerCategory> findSystemCategories();

	boolean existsSystemCategory(String categoryId);

	Optional<CareerCategory> findSystemCategoryById(String categoryId);

	default Optional<CareerCategory> findAccessibleCategoryById(String ownerId, String categoryId) {
		return findSystemCategoryById(categoryId);
	}

	default void addExactOptions(String categoryId, Map<String, List<CareerDuplicatePropertiesMapper.Option>> options) {
		if (!options.isEmpty()) throw new UnsupportedOperationException("Category option 저장을 지원하지 않습니다");
	}

}

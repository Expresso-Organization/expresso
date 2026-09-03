package com.expresso.backend.career.application;

import java.util.List;
import java.util.Optional;

import com.expresso.backend.career.domain.CareerCategory;

public interface CareerCategoryRepository {

	List<CareerCategory> findSystemCategories();

	boolean existsSystemCategory(String categoryId);

	Optional<CareerCategory> findSystemCategoryById(String categoryId);

}

package com.expresso.backend.career.application;

import java.util.List;

import com.expresso.backend.career.domain.CareerCategory;

public interface CareerCategoryRepository {

	List<CareerCategory> findSystemCategories();

}

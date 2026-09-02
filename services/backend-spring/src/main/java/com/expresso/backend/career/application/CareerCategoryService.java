package com.expresso.backend.career.application;

import java.util.List;

import org.springframework.stereotype.Service;

import com.expresso.backend.career.domain.CareerCategory;

@Service
public class CareerCategoryService implements ListCareerCategoriesUseCase {

	private final CareerCategoryRepository repository;

	public CareerCategoryService(CareerCategoryRepository repository) {
		this.repository = repository;
	}

	@Override
	public List<CareerCategory> list() {
		return repository.findSystemCategories();
	}

}

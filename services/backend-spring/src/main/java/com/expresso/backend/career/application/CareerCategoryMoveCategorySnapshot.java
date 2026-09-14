package com.expresso.backend.career.application;

import com.expresso.backend.career.domain.CareerCategory;

public record CareerCategoryMoveCategorySnapshot(CareerCategory category, long schemaVersion) {
	public CareerCategoryMoveCategorySnapshot {
		if (schemaVersion < 1) throw new IllegalArgumentException("Category schemaVersion은 1 이상이어야 합니다");
	}
}

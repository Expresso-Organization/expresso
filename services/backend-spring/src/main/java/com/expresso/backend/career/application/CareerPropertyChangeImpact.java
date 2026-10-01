package com.expresso.backend.career.application;

import java.util.List;

public record CareerPropertyChangeImpact(
		long affectedRecordCount,
		long convertibleCount,
		List<String> dependentViews,
		List<String> dependentFormulas,
		List<String> dependentRollups) {

	public static CareerPropertyChangeImpact empty() {
		return new CareerPropertyChangeImpact(0, 0, List.of(), List.of(), List.of());
	}
}

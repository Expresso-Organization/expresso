package com.expresso.backend.career.application;

public record CareerPropertyCreatePreview(
		String categoryId,
		long categoryVersion,
		CareerPropertySchemaChange change,
		CareerPropertyChangeImpact impact,
		String previewToken) {
}

package com.expresso.backend.career.application;

public record CareerCategoryMoveToken(
		String userId,
		String recordId,
		String sourceCategoryId,
		String targetCategoryId,
		long recordVersion,
		long sourceSchemaVersion,
		long targetSchemaVersion,
		String planDigest) {
}

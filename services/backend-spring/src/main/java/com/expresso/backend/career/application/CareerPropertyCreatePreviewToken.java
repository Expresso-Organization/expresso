package com.expresso.backend.career.application;

public record CareerPropertyCreatePreviewToken(
		String userId,
		String categoryId,
		long categoryVersion,
		String changeDigest) {
}

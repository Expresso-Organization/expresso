package com.expresso.backend.career.application;

import java.util.List;

public record CommitCareerCategoryMoveCommand(
		String targetCategoryId,
		String previewToken,
		long expectedVersion,
		List<String> discardUnmappedPropertyIds) {
	public CommitCareerCategoryMoveCommand {
		discardUnmappedPropertyIds = List.copyOf(discardUnmappedPropertyIds);
	}
}

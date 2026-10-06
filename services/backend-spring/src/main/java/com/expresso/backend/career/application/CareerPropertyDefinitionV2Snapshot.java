package com.expresso.backend.career.application;

import java.time.Instant;
import java.util.Map;

public record CareerPropertyDefinitionV2Snapshot(
		String id,
		String key,
		String name,
		String type,
		boolean required,
		boolean system,
		Map<String, Object> config,
		int order,
		long version,
		Instant deletedAt) {
}

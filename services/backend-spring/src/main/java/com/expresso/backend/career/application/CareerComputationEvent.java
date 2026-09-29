package com.expresso.backend.career.application;

import java.util.List;
import java.util.Map;
import java.util.Objects;

public record CareerComputationEvent(
		String userId,
		String recordId,
		List<String> changedPropertyIds,
		long sourceRecordVersion,
		Map<String, Long> sourcePropertyVersions,
		String idempotencyKey) {

	public CareerComputationEvent(
			String userId,
			String recordId,
			List<String> changedPropertyIds,
			long sourceRecordVersion,
			Map<String, Long> sourcePropertyVersions) {
		this(userId, recordId, changedPropertyIds, sourceRecordVersion, sourcePropertyVersions, null);
	}

	public CareerComputationEvent {
		Objects.requireNonNull(userId, "userId는 null일 수 없습니다");
		Objects.requireNonNull(recordId, "recordId는 null일 수 없습니다");
		changedPropertyIds = List.copyOf(Objects.requireNonNull(
				changedPropertyIds, "changedPropertyIds는 null일 수 없습니다"));
		if (changedPropertyIds.isEmpty()) {
			throw new IllegalArgumentException("changedPropertyIds는 비어 있을 수 없습니다");
		}
		if (sourceRecordVersion < 1) {
			throw new IllegalArgumentException("sourceRecordVersion은 1 이상이어야 합니다");
		}
		if (sourcePropertyVersions != null) {
			sourcePropertyVersions = Map.copyOf(sourcePropertyVersions);
		}
	}
}

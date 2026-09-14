package com.expresso.backend.career.application;

import java.time.Instant;
import java.util.Objects;

public record CareerRecordTrashResult(String recordId, Instant deletedAt, Instant purgeAfter, long version) {

	public CareerRecordTrashResult {
		Objects.requireNonNull(recordId, "recordId는 null일 수 없습니다");
		Objects.requireNonNull(deletedAt, "deletedAt은 null일 수 없습니다");
		Objects.requireNonNull(purgeAfter, "purgeAfter는 null일 수 없습니다");
		if (version < 2) throw new IllegalArgumentException("삭제된 CareerRecord version은 2 이상이어야 합니다");
	}
}

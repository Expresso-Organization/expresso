package com.expresso.backend.career.application;

import java.time.Clock;
import java.time.Duration;
import java.time.temporal.ChronoUnit;
import java.util.Objects;

import org.springframework.stereotype.Service;

import com.expresso.backend.career.domain.CareerRecord;

@Service
public class CareerRecordLifecycleService implements TrashCareerRecordUseCase, RestoreCareerRecordUseCase {

	private static final Duration RETENTION_PERIOD = Duration.ofDays(30);
	private final CareerRecordRepository recordRepository;
	private final CareerRecordLifecycleRepository lifecycleRepository;
	private final Clock clock;

	public CareerRecordLifecycleService(
			CareerRecordRepository recordRepository,
			CareerRecordLifecycleRepository lifecycleRepository,
			Clock clock) {
		this.recordRepository = Objects.requireNonNull(recordRepository, "recordRepository는 null일 수 없습니다");
		this.lifecycleRepository = Objects.requireNonNull(
				lifecycleRepository, "lifecycleRepository는 null일 수 없습니다");
		this.clock = Objects.requireNonNull(clock, "clock은 null일 수 없습니다");
	}

	@Override
	public CareerRecordTrashResult trash(String ownerId, String recordId, long expectedVersion) {
		Objects.requireNonNull(ownerId, "ownerId는 null일 수 없습니다");
		Objects.requireNonNull(recordId, "recordId는 null일 수 없습니다");
		var current = recordRepository.findOwnedCanonicalById(ownerId, recordId)
				.orElseThrow(CareerRecordNotFoundException::new);
		validateExpectedVersion(current, expectedVersion);
		ensureCanIncrement(current.version(), "CareerRecord version");
		var deletedAt = clock.instant().truncatedTo(ChronoUnit.MILLIS);
		return lifecycleRepository.trashOwnedCanonical(current, deletedAt, deletedAt.plus(RETENTION_PERIOD))
				.orElseThrow(CareerRecordPreconditionFailedException::new);
	}

	@Override
	public CareerRecord restore(String ownerId, String recordId, long expectedVersion) {
		Objects.requireNonNull(ownerId, "ownerId는 null일 수 없습니다");
		Objects.requireNonNull(recordId, "recordId는 null일 수 없습니다");
		var now = clock.instant().truncatedTo(ChronoUnit.MILLIS);
		var candidate = lifecycleRepository.findOwnedRestorableCanonicalById(ownerId, recordId, now)
				.orElseThrow(CareerRecordNotFoundException::new);
		validateExpectedVersion(candidate.record(), expectedVersion);
		ensureCanIncrement(candidate.record().version(), "CareerRecord version");
		if (candidate.referenceVersion() != null) {
			ensureCanIncrement(candidate.referenceVersion(), "CareerRecord referenceVersion");
		}
		return lifecycleRepository.restoreOwnedCanonical(candidate, now)
				.orElseThrow(CareerRecordPreconditionFailedException::new);
	}

	private static void validateExpectedVersion(CareerRecord record, long expectedVersion) {
		if (record.version() != expectedVersion) throw new CareerRecordPreconditionFailedException();
	}

	private static void ensureCanIncrement(long value, String field) {
		if (value == Long.MAX_VALUE) {
			throw new CareerRecordDataIntegrityException(
					new ArithmeticException(field + "을 더 이상 증가시킬 수 없습니다"));
		}
	}
}

package com.expresso.backend.career.application;

import java.time.Clock;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Objects;
import java.util.TreeSet;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.expresso.backend.career.domain.CareerRecord;

@Service
public class CareerRelationService implements ReplaceCareerRelationTargetsUseCase {

	private final CareerRelationRepository repository;
	private final CareerComputationOutbox computationOutbox;
	private final Clock clock;

	public CareerRelationService(
			CareerRelationRepository repository,
			CareerComputationOutbox computationOutbox,
			Clock clock) {
		this.repository = Objects.requireNonNull(repository, "repository는 null일 수 없습니다");
		this.computationOutbox = Objects.requireNonNull(computationOutbox, "computationOutbox는 null일 수 없습니다");
		this.clock = Objects.requireNonNull(clock, "clock은 null일 수 없습니다");
	}

	@Override
	@Transactional
	public CareerRecord replace(
			String userId,
			String recordId,
			String propertyId,
			List<String> requestedTargetIds,
			long expectedVersion) {
		Objects.requireNonNull(userId, "userId는 null일 수 없습니다");
		Objects.requireNonNull(recordId, "recordId는 null일 수 없습니다");
		Objects.requireNonNull(propertyId, "propertyId는 null일 수 없습니다");
		Objects.requireNonNull(requestedTargetIds, "targetIds는 null일 수 없습니다");
		if (requestedTargetIds.size() > 1_000) {
			throw new CareerRecordValidationException("relation targetIds는 최대 1000개까지 허용됩니다");
		}
		var targetIds = List.copyOf(new TreeSet<>(requestedTargetIds));
		if (targetIds.contains(recordId)) {
			throw new CareerRecordValidationException("CareerRecord는 자기 자신을 relation target으로 사용할 수 없습니다");
		}
		var result = repository.replaceTargets(
				userId, recordId, propertyId, targetIds, expectedVersion,
				clock.instant().truncatedTo(ChronoUnit.MILLIS));
		result.computationEvents().forEach(computationOutbox::append);
		return result.record();
	}
}

package com.expresso.backend.career.application;

import java.time.Clock;
import java.time.temporal.ChronoUnit;
import java.util.HashSet;
import java.util.Objects;

import org.springframework.stereotype.Service;

import com.expresso.backend.career.domain.CareerRecord;
import com.expresso.backend.career.domain.CareerRecordChangeSet;

@Service
public class CareerRecordPatchService implements PatchCareerRecordUseCase {

	private final CareerRecordRepository recordRepository;
	private final CareerCategoryRepository categoryRepository;
	private final Clock clock;

	public CareerRecordPatchService(
			CareerRecordRepository recordRepository,
			CareerCategoryRepository categoryRepository,
			Clock clock) {
		this.recordRepository = Objects.requireNonNull(recordRepository, "recordRepository는 null일 수 없습니다");
		this.categoryRepository = Objects.requireNonNull(categoryRepository, "categoryRepository는 null일 수 없습니다");
		this.clock = Objects.requireNonNull(clock, "clock은 null일 수 없습니다");
	}

	@Override
	public CareerRecord patch(
			String ownerId,
			String recordId,
			long expectedVersion,
			CareerRecordChangeSet changeSet) {
		Objects.requireNonNull(ownerId, "ownerId는 null일 수 없습니다");
		Objects.requireNonNull(recordId, "recordId는 null일 수 없습니다");
		Objects.requireNonNull(changeSet, "changeSet은 null일 수 없습니다");

		var currentRecord = recordRepository.findOwnedCanonicalById(ownerId, recordId)
				.orElseThrow(CareerRecordNotFoundException::new);
		if (currentRecord.version() != expectedVersion) {
			throw new CareerRecordPreconditionFailedException();
		}
		validatePropertyDefinitions(currentRecord, changeSet);

		CareerRecord updatedRecord;
		try {
			updatedRecord = currentRecord.apply(
					changeSet,
					clock.instant().truncatedTo(ChronoUnit.MILLIS));
		}
		catch (IllegalArgumentException validationError) {
			throw new CareerRecordValidationException("CareerRecord 변경 값이 올바르지 않습니다", validationError);
		}
		return recordRepository.updateOwnedCanonical(currentRecord, updatedRecord)
				.orElseGet(() -> distinguishMissingFromStale(ownerId, recordId));
	}

	private void validatePropertyDefinitions(CareerRecord currentRecord, CareerRecordChangeSet changeSet) {
		if (changeSet.propertyValues().isEmpty()) {
			return;
		}
		var category = categoryRepository.findSystemCategoryById(currentRecord.categoryId())
				.orElseThrow(() -> new CareerRecordValidationException(
						"propertyValues를 변경할 수 있는 system Category를 찾을 수 없습니다"));
		var allowedDefinitionIds = new HashSet<String>();
		for (var definition : category.propertyDefinitions()) {
			allowedDefinitionIds.add(definition.id());
		}
		for (var propertyValue : changeSet.propertyValues().orElseThrow()) {
			if (!allowedDefinitionIds.contains(propertyValue.propertyDefinitionId())) {
				throw new CareerRecordValidationException(
						"현재 Category에서 허용하지 않는 propertyDefinitionId입니다: "
								+ propertyValue.propertyDefinitionId());
			}
		}
	}

	private CareerRecord distinguishMissingFromStale(String ownerId, String recordId) {
		if (recordRepository.findOwnedCanonicalById(ownerId, recordId).isEmpty()) {
			throw new CareerRecordNotFoundException();
		}
		throw new CareerRecordPreconditionFailedException();
	}

}

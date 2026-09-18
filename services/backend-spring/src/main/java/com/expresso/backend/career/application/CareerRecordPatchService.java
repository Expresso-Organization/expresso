package com.expresso.backend.career.application;

import java.time.Clock;
import java.time.temporal.ChronoUnit;
import java.util.HashSet;
import java.util.Map;
import java.util.Objects;

import org.springframework.stereotype.Service;

import com.expresso.backend.career.domain.CareerRecord;
import com.expresso.backend.career.domain.CareerRecordChangeSet;
import com.expresso.backend.career.domain.CareerRecordStatus;
import com.expresso.backend.career.domain.MultiSelectPropertyValue;
import com.expresso.backend.career.domain.PropertyDefinition;
import com.expresso.backend.career.domain.PropertyValue;
import com.expresso.backend.career.domain.SelectPropertyValue;

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
		var allowedDefinitions = new java.util.HashMap<String, PropertyDefinition>();
		for (var definition : category.propertyDefinitions()) {
			if (definition.type().writable() && definition.deletedAt() == null) {
				allowedDefinitions.put(definition.id(), definition);
			}
		}
		for (var propertyValue : changeSet.propertyValues().orElseThrow()) {
			var definition = allowedDefinitions.get(propertyValue.propertyDefinitionId());
			if (definition == null) {
				throw new CareerRecordValidationException(
						"현재 Category에서 허용하지 않는 propertyDefinitionId입니다: "
								+ propertyValue.propertyDefinitionId());
			}
			if (!definition.type().wireName().equals(propertyValue.type().wireName())) {
				throw new CareerRecordValidationException(
						"PropertyValue type이 현재 PropertyDefinition과 일치하지 않습니다: "
								+ propertyValue.propertyDefinitionId());
			}
			validateSelectOptions(definition.config(), propertyValue);
		}
	}

	@Override
	public CareerRecord patchStatus(
			String ownerId,
			String recordId,
			long expectedVersion,
			CareerRecordStatus status) {
		Objects.requireNonNull(ownerId, "ownerId는 null일 수 없습니다");
		Objects.requireNonNull(recordId, "recordId는 null일 수 없습니다");
		Objects.requireNonNull(status, "status는 null일 수 없습니다");

		var currentRecord = recordRepository.findOwnedCanonicalById(ownerId, recordId)
				.orElseThrow(CareerRecordNotFoundException::new);
		if (currentRecord.version() != expectedVersion) {
			throw new CareerRecordPreconditionFailedException();
		}
		return recordRepository.updateOwnedStatus(
				currentRecord,
				status,
				clock.instant().truncatedTo(ChronoUnit.MILLIS))
				.orElseGet(() -> distinguishMissingFromStale(ownerId, recordId));
	}

	private static void validateSelectOptions(Map<String, Object> config, PropertyValue value) {
		if (!(value instanceof SelectPropertyValue) && !(value instanceof MultiSelectPropertyValue)) {
			return;
		}
		var optionIds = optionIds(config);
		if (value instanceof SelectPropertyValue select && select.value() != null
				&& !optionIds.contains(select.value())) {
			throw new CareerRecordValidationException("select option이 현재 PropertyDefinition에 없습니다");
		}
		if (value instanceof MultiSelectPropertyValue multiSelect
				&& !optionIds.containsAll(multiSelect.value())) {
			throw new CareerRecordValidationException("multi_select option이 현재 PropertyDefinition에 없습니다");
		}
	}

	private static HashSet<String> optionIds(Map<String, Object> config) {
		var rawOptions = config.get("options");
		if (!(rawOptions instanceof java.util.List<?> options)) {
			throw new CareerRecordDataIntegrityException(
					new IllegalStateException("select PropertyDefinition config.options가 배열이 아닙니다"));
		}
		var ids = new HashSet<String>();
		for (var rawOption : options) {
			if (!(rawOption instanceof Map<?, ?> option) || !(option.get("id") instanceof String id)) {
				throw new CareerRecordDataIntegrityException(
						new IllegalStateException("select PropertyDefinition option id가 올바르지 않습니다"));
			}
			ids.add(id);
		}
		return ids;
	}

	private CareerRecord distinguishMissingFromStale(String ownerId, String recordId) {
		if (recordRepository.findOwnedCanonicalById(ownerId, recordId).isEmpty()) {
			throw new CareerRecordNotFoundException();
		}
		throw new CareerRecordPreconditionFailedException();
	}

}

package com.expresso.backend.career.application;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.temporal.ChronoUnit;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import com.mongodb.MongoException;

import com.expresso.backend.career.domain.CareerRecord;
import com.expresso.backend.career.domain.MultiSelectPropertyValue;
import com.expresso.backend.career.domain.PropertyDefinition;
import com.expresso.backend.career.domain.PropertyDefinitionType;
import com.expresso.backend.career.domain.PropertyValue;
import com.expresso.backend.career.domain.SelectPropertyValue;

@Service
public class CareerRecordCreationService implements CreateCareerRecordUseCase {

	private final CareerCategoryRepository categoryRepository;
	private final CareerRecordRepository recordRepository;
	private final CareerComputationOutbox computationOutbox;
	private final CareerDuplicatePropertiesMapper duplicatePropertiesMapper = new CareerDuplicatePropertiesMapper();
	private final TransactionTemplate transactionTemplate;
	private final Clock clock;

	public CareerRecordCreationService(
			CareerCategoryRepository categoryRepository,
			CareerRecordRepository recordRepository,
			CareerComputationOutbox computationOutbox,
			PlatformTransactionManager transactionManager,
			Clock clock) {
		this.categoryRepository = Objects.requireNonNull(categoryRepository, "categoryRepository는 null일 수 없습니다");
		this.recordRepository = Objects.requireNonNull(recordRepository, "recordRepository는 null일 수 없습니다");
		this.computationOutbox = Objects.requireNonNull(computationOutbox, "computationOutbox는 null일 수 없습니다");
		this.transactionTemplate = new TransactionTemplate(Objects.requireNonNull(
				transactionManager, "transactionManager는 null일 수 없습니다"));
		this.clock = Objects.requireNonNull(clock, "clock은 null일 수 없습니다");
	}

	@Override
	public CreateCareerRecordResult create(
			String ownerId,
			CreateCareerRecordCommand command,
			String idempotencyKey) {
		Objects.requireNonNull(ownerId, "ownerId는 null일 수 없습니다");
		Objects.requireNonNull(command, "command는 null일 수 없습니다");
		Objects.requireNonNull(idempotencyKey, "idempotencyKey는 null일 수 없습니다");
		if (command.mode() == CreateCareerRecordCommand.Mode.DUPLICATE) {
			var duplicate = createDuplicateRecordWithRetry(ownerId, command, idempotencyKey);
			return new CreateCareerRecordResult(duplicate.record(), duplicate.created());
		}
		if (command.mode() == CreateCareerRecordCommand.Mode.GROUPED) {
			var grouped = createGroupedRecordWithRetry(
					ownerId, command.categoryId(), command.propertyValues(), idempotencyKey);
			return new CreateCareerRecordResult(grouped.record(), grouped.created());
		}
		categoryRepository.findAccessibleCategoryById(ownerId, command.categoryId())
				.orElseThrow(CareerRecordCategoryNotAllowedException::new);
		var newRecord = createRecord(ownerId, command.categoryId(), "", List.of());
		var result = recordRepository.createOrReplay(
				newRecord, idempotencyKey, requestHash(command.categoryId(), null), Map.of());
		return new CreateCareerRecordResult(result.record(), result.created());
	}

	private CareerRecordRepository.CreateResult createDuplicateRecordWithRetry(
			String ownerId,
			CreateCareerRecordCommand command,
			String idempotencyKey) {
		for (var attempt = 1; attempt <= 3; attempt++) {
			try {
				var result = transactionTemplate.execute(status -> createDuplicateRecord(ownerId, command, idempotencyKey));
				if (result == null) throw new IllegalStateException("CareerRecord 복제 transaction 결과가 없습니다");
				return result;
			}
			catch (RuntimeException error) {
				if (attempt == 3 || !isTransientTransactionConflict(error)) throw error;
			}
		}
		throw new IllegalStateException("CareerRecord 복제 transaction을 완료할 수 없습니다");
	}

	private CareerRecordRepository.CreateResult createDuplicateRecord(
			String ownerId,
			CreateCareerRecordCommand command,
			String idempotencyKey) {
		var category = categoryRepository.findAccessibleCategoryById(ownerId, command.categoryId())
				.orElseThrow(CareerRecordCategoryNotAllowedException::new);
		var mapped = duplicatePropertiesMapper.map(category.propertyDefinitions(), command.compatibilityProperties());
		categoryRepository.addExactOptions(category.id(), mapped.newOptionsByDefinitionId());
		var newRecord = createRecord(ownerId, command.categoryId(), command.title(), mapped.propertyValues());
		var result = recordRepository.createOrReplay(
				newRecord, idempotencyKey, duplicateRequestHash(command),
				command.compatibilityProperties(), command.bodyMd());
		if (result.created()) {
			appendComputationWork(result.record(), category.propertyDefinitions(), mapped.propertyValues());
		}
		return result;
	}

	private CareerRecordRepository.CreateResult createGroupedRecordWithRetry(
			String ownerId,
			String categoryId,
			List<PropertyValue> propertyValues,
			String idempotencyKey) {
		for (var attempt = 1; attempt <= 3; attempt++) {
			try {
				var result = transactionTemplate.execute(status -> createGroupedRecord(
						ownerId, categoryId, propertyValues, idempotencyKey));
				if (result == null) throw new IllegalStateException("CareerRecord 생성 transaction 결과가 없습니다");
				return result;
			}
			catch (RuntimeException error) {
				if (attempt == 3 || !isTransientTransactionConflict(error)) throw error;
			}
		}
		throw new IllegalStateException("CareerRecord 생성 transaction을 완료할 수 없습니다");
	}

	private static boolean isTransientTransactionConflict(Throwable error) {
		for (var cause = error; cause != null; cause = cause.getCause()) {
			if (cause instanceof MongoException mongoException
					&& (mongoException.getCode() == 112
							|| mongoException.hasErrorLabel(MongoException.TRANSIENT_TRANSACTION_ERROR_LABEL))) {
				return true;
			}
		}
		return false;
	}

	private CareerRecordRepository.CreateResult createGroupedRecord(
			String ownerId,
			String categoryId,
			List<PropertyValue> propertyValues,
			String idempotencyKey) {
		var category = categoryRepository.findAccessibleCategoryById(ownerId, categoryId)
				.orElseThrow(CareerRecordCategoryNotAllowedException::new);
		var initial = validateInitialPropertyValue(category.propertyDefinitions(), propertyValues);
		var newRecord = createRecord(ownerId, categoryId, "", propertyValues);
		var result = recordRepository.createOrReplay(
				newRecord, idempotencyKey, requestHash(categoryId, initial), legacyProperties(initial));
		if (result.created()) appendComputationWork(result.record(), category.propertyDefinitions(), initial.definition());
		return result;
	}

	private CareerRecord createRecord(
			String ownerId,
			String categoryId,
			String title,
			List<PropertyValue> propertyValues) {
		return CareerRecord.create(
				UUID.randomUUID().toString(),
				ownerId,
				categoryId,
				title,
				UUID.randomUUID().toString(),
				propertyValues,
				clock.instant().truncatedTo(ChronoUnit.MILLIS));
	}

	private static InitialProperty validateInitialPropertyValue(
			List<PropertyDefinition> definitions,
			List<PropertyValue> propertyValues) {
		if (propertyValues.isEmpty()) return null;
		if (propertyValues.size() != 1) {
			throw new CareerRecordValidationException("생성 propertyValues에는 값 하나만 사용할 수 있습니다");
		}
		var value = propertyValues.getFirst();
		var definition = definitions.stream()
				.filter(item -> item.id().equals(value.propertyDefinitionId()) && item.deletedAt() == null)
				.findFirst()
				.orElseThrow(() -> new CareerRecordValidationException(
						"현재 Category에서 사용할 수 없는 propertyDefinitionId입니다"));
		if (definition.type() != PropertyDefinitionType.SELECT
				&& definition.type() != PropertyDefinitionType.MULTI_SELECT) {
			throw new CareerRecordValidationException("그룹 생성에는 select 또는 multi_select Definition만 사용할 수 있습니다");
		}
		if (!definition.type().wireName().equals(value.type().wireName())) {
			throw new CareerRecordValidationException("초기 PropertyValue type이 PropertyDefinition과 일치하지 않습니다");
		}
		var optionIds = optionIds(definition);
		if (value instanceof SelectPropertyValue select
				&& (select.value() == null || !optionIds.contains(select.value()))) {
			throw new CareerRecordValidationException("select option이 현재 PropertyDefinition에 없습니다");
		}
		if (value instanceof MultiSelectPropertyValue multiSelect
				&& (multiSelect.value().size() != 1 || !optionIds.containsAll(multiSelect.value()))) {
			throw new CareerRecordValidationException("multi_select option이 현재 PropertyDefinition에 없습니다");
		}
		return new InitialProperty(definition, value);
	}

	private static java.util.Set<String> optionIds(PropertyDefinition definition) {
		var rawOptions = definition.config().get("options");
		if (!(rawOptions instanceof List<?> options)) {
			throw new CareerRecordDataIntegrityException(
					new IllegalStateException("select PropertyDefinition config.options가 배열이 아닙니다"));
		}
		var ids = new java.util.HashSet<String>();
		for (var rawOption : options) {
			if (!(rawOption instanceof Map<?, ?> option) || !(option.get("id") instanceof String id)) {
				throw new CareerRecordDataIntegrityException(
						new IllegalStateException("select PropertyDefinition option id가 올바르지 않습니다"));
			}
			ids.add(id);
		}
		return ids;
	}

	private static Map<String, Object> legacyProperties(InitialProperty initial) {
		if (initial == null) return Map.of();
		var legacyValue = new LinkedHashMap<String, Object>();
		legacyValue.put("type", initial.value().type().wireName());
		if (initial.value() instanceof SelectPropertyValue select) {
			legacyValue.put("value", select.value());
		}
		else if (initial.value() instanceof MultiSelectPropertyValue multiSelect) {
			legacyValue.put("value", multiSelect.value());
		}
		return Map.of(initial.definition().key(), legacyValue);
	}

	private void appendComputationWork(
			CareerRecord record,
			List<PropertyDefinition> definitions,
			PropertyDefinition initialDefinition) {
		var changedDefinitions = definitions.stream()
				.filter(definition -> definition.deletedAt() == null)
				.filter(definition -> definition.id().equals(initialDefinition.id())
						|| definition.type() == PropertyDefinitionType.FORMULA
						|| definition.type() == PropertyDefinitionType.ROLLUP)
				.toList();
		var versions = new LinkedHashMap<String, Long>();
		changedDefinitions.forEach(definition -> versions.put(definition.id(), definition.version()));
		computationOutbox.append(new CareerComputationEvent(
				record.ownerId(), record.id(),
				changedDefinitions.stream().map(PropertyDefinition::id).toList(),
				record.version(), versions,
				"career-record-create:" + record.id() + ":v1"));
	}

	private void appendComputationWork(
			CareerRecord record,
			List<PropertyDefinition> definitions,
			List<PropertyValue> values) {
		var changedValueIds = values.stream().map(PropertyValue::propertyDefinitionId).collect(
				java.util.stream.Collectors.toSet());
		var changedDefinitions = definitions.stream()
				.filter(definition -> definition.deletedAt() == null)
				.filter(definition -> changedValueIds.contains(definition.id())
						|| definition.type() == PropertyDefinitionType.FORMULA
						|| definition.type() == PropertyDefinitionType.ROLLUP)
				.toList();
		if (changedDefinitions.isEmpty()) return;
		var versions = new LinkedHashMap<String, Long>();
		changedDefinitions.forEach(definition -> versions.put(definition.id(), definition.version()));
		computationOutbox.append(new CareerComputationEvent(
				record.ownerId(), record.id(),
				changedDefinitions.stream().map(PropertyDefinition::id).toList(),
				record.version(), versions,
				"career-record-create:" + record.id() + ":v1"));
	}

	private static String duplicateRequestHash(CreateCareerRecordCommand command) {
		var canonical = new StringBuilder();
		appendHashValue(canonical, Map.of(
				"bodyMd", command.bodyMd(),
				"categoryId", command.categoryId(),
				"properties", command.compatibilityProperties(),
				"title", command.title()));
		try {
			return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
					.digest(canonical.toString().getBytes(StandardCharsets.UTF_8)));
		}
		catch (NoSuchAlgorithmException error) {
			throw new IllegalStateException("SHA-256 해시 알고리즘을 사용할 수 없습니다", error);
		}
	}

	private static void appendHashValue(StringBuilder target, Object value) {
		if (value == null) {
			target.append("null;");
		}
		else if (value instanceof Map<?, ?> map) {
			target.append('{');
			map.entrySet().stream().sorted(java.util.Comparator.comparing(entry -> String.valueOf(entry.getKey())))
					.forEach(entry -> {
						appendHashValue(target, String.valueOf(entry.getKey()));
						appendHashValue(target, entry.getValue());
					});
			target.append('}');
		}
		else if (value instanceof List<?> list) {
			target.append('[');
			list.forEach(item -> appendHashValue(target, item));
			target.append(']');
		}
		else {
			var text = String.valueOf(value);
			target.append(text.length()).append(':').append(text).append(';');
		}
	}

	private static String requestHash(String categoryId, InitialProperty initial) {
		// Fastify가 같은 빈 생성 요청에 기본값을 적용한 뒤 만드는 안정 정렬 JSON과 같습니다.
		var properties = initial == null ? "{}" : legacyRequestProperty(initial);
		var canonicalRequest = "{\"bodyMd\":\"\",\"categoryId\":\"" + categoryId
				+ "\",\"properties\":" + properties + ",\"title\":\"\"}";
		try {
			var digest = MessageDigest.getInstance("SHA-256");
			return HexFormat.of().formatHex(digest.digest(canonicalRequest.getBytes(StandardCharsets.UTF_8)));
		}
		catch (NoSuchAlgorithmException error) {
			throw new IllegalStateException("SHA-256 해시 알고리즘을 사용할 수 없습니다", error);
		}
	}

	private static String legacyRequestProperty(InitialProperty initial) {
		var value = initial.value() instanceof SelectPropertyValue select
				? (select.value() == null ? "null" : "\"" + select.value() + "\"")
				: ((MultiSelectPropertyValue) initial.value()).value().stream()
						.map(optionId -> "\"" + optionId + "\"")
						.collect(java.util.stream.Collectors.joining(",", "[", "]"));
		return "{\"" + initial.definition().key() + "\":{\"type\":\""
				+ initial.value().type().wireName() + "\",\"value\":" + value + "}}";
	}

	private record InitialProperty(PropertyDefinition definition, PropertyValue value) {
	}

}

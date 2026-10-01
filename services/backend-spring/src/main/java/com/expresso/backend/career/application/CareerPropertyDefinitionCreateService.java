package com.expresso.backend.career.application;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.expresso.backend.career.domain.PropertyDefinition;
import com.expresso.backend.career.domain.PropertyDefinitionType;

@Service
public class CareerPropertyDefinitionCreateService {

	private final CareerPropertyDefinitionCreateRepository repository;
	private final CareerPropertyCreatePreviewSigner signer;
	private final CareerComputationOutbox computationOutbox;
	private final Clock clock;

	public CareerPropertyDefinitionCreateService(
			CareerPropertyDefinitionCreateRepository repository,
			CareerPropertyCreatePreviewSigner signer,
			CareerComputationOutbox computationOutbox,
			Clock clock) {
		this.repository = Objects.requireNonNull(repository, "repository는 null일 수 없습니다");
		this.signer = Objects.requireNonNull(signer, "signer는 null일 수 없습니다");
		this.computationOutbox = Objects.requireNonNull(computationOutbox, "computationOutbox는 null일 수 없습니다");
		this.clock = Objects.requireNonNull(clock, "clock은 null일 수 없습니다");
	}

	public CareerPropertyCreatePreview preview(
			String userId, String categoryId, CareerPropertySchemaChange rawChange) {
		var change = validated(rawChange);
		var category = category(userId, categoryId);
		validateSpecialCreateReferences(userId, category, change);
		var now = clock.instant().truncatedTo(ChronoUnit.MILLIS);
		var token = new CareerPropertyCreatePreviewToken(
				userId, categoryId, category.version(), digest(change));
		return new CareerPropertyCreatePreview(
				categoryId, category.version(), change,
				impact(userId, category, change), signer.sign(token, now));
	}

	@Transactional
	public CareerPropertyCategorySnapshot apply(
			String userId,
			String categoryId,
			long expectedVersion,
			String idempotencyKey,
			CareerPropertySchemaChange rawChange,
			String previewToken) {
		var change = validated(rawChange);
		var requestHash = digest("apply", digest(change), previewToken, "false");
		var idempotencyDigest = digest("idempotency", idempotencyKey);
		var category = category(userId, categoryId);
		validateSpecialCreateReferences(userId, category, change);
		var prior = repository.findMutationResult(userId, categoryId, idempotencyDigest);
		if (prior.isPresent()) {
			if (!MessageDigest.isEqual(
					prior.get().requestHash().getBytes(StandardCharsets.UTF_8),
					requestHash.getBytes(StandardCharsets.UTF_8))) {
				throw new CareerPropertyDefinitionConflictException("Idempotency-Key가 다른 요청에 이미 사용되었습니다");
			}
			return prior.get().category();
		}
		if (category.version() != expectedVersion) {
			throw new CareerPropertyDefinitionConflictException("Category version이 최신 상태와 다릅니다");
		}
		var now = clock.instant().truncatedTo(ChronoUnit.MILLIS);
		var expectedToken = new CareerPropertyCreatePreviewToken(
				userId, categoryId, expectedVersion, digest(change));
		if (!signer.verify(previewToken, expectedToken, now)) {
			throw new CareerPropertyDefinitionConflictException("preview token이 만료되었거나 현재 요청과 다릅니다");
		}
		if (category.version() == Long.MAX_VALUE || category.schemaVersion() == Long.MAX_VALUE) {
			throw new CareerPropertyDefinitionConflictException("Category version을 더 이상 증가시킬 수 없습니다");
		}

		var canonical = new ArrayList<>(category.propertyDefinitions());
		var v2 = new ArrayList<>(category.propertySchemaV2());
		if (change instanceof CareerPropertyCreateChange create) {
			var propertyId = create.id() == null ? UUID.randomUUID().toString() : create.id();
			validateIdentity(category, propertyId, create.key());
			var order = create.order() == null ? category.propertyDefinitions().size() : create.order();
			canonical.add(new PropertyDefinition(
					propertyId, create.key(), create.name(), create.type(), false, false,
					create.config(), order, 1, null));
			v2.add(new CareerPropertyDefinitionV2Snapshot(
					propertyId, create.key(), create.name(), create.type().wireName(), false, false,
					create.config(), order, 1, null));
		}
		else if (change instanceof CareerPropertyRenameChange rename) {
			var canonicalIndex = definitionIndex(canonical, rename.propertyId());
			if (canonicalIndex < 0) throw new CareerRecordNotFoundException();
			var source = canonical.get(canonicalIndex);
			if (source.system()) {
				throw new CareerPropertyDefinitionForbiddenException("system PropertyDefinition은 이름을 변경할 수 없습니다");
			}
			if (source.version() == Long.MAX_VALUE) {
				throw new CareerPropertyDefinitionConflictException("PropertyDefinition version을 더 이상 증가시킬 수 없습니다");
			}
			var v2Index = v2DefinitionIndex(v2, rename.propertyId());
			if (v2Index < 0) {
				throw new CareerRecordDataIntegrityException(
						new IllegalStateException("canonical PropertyDefinition에 대응하는 propertySchemaV2 항목이 없습니다"));
			}
			var sourceV2 = v2.get(v2Index);
			canonical.set(canonicalIndex, new PropertyDefinition(
					source.id(), source.key(), rename.name(), source.type(), source.required(), source.system(),
					source.config(), source.order(), source.version() + 1, source.deletedAt()));
			v2.set(v2Index, new CareerPropertyDefinitionV2Snapshot(
					sourceV2.id(), sourceV2.key(), rename.name(), sourceV2.type(), sourceV2.required(),
					sourceV2.system(), sourceV2.config(), sourceV2.order(), sourceV2.version() + 1,
					sourceV2.deletedAt()));
		}
		else if (change instanceof CareerPropertyReorderChange reorder) {
			var canonicalIndex = definitionIndex(canonical, reorder.propertyId());
			if (canonicalIndex < 0) throw new CareerRecordNotFoundException();
			var source = canonical.get(canonicalIndex);
			if (source.system()) {
				throw new CareerPropertyDefinitionForbiddenException("system PropertyDefinition은 순서를 변경할 수 없습니다");
			}
			if (source.version() == Long.MAX_VALUE) {
				throw new CareerPropertyDefinitionConflictException("PropertyDefinition version을 더 이상 증가시킬 수 없습니다");
			}
			var v2Index = v2DefinitionIndex(v2, reorder.propertyId());
			if (v2Index < 0) {
				throw new CareerRecordDataIntegrityException(
						new IllegalStateException("canonical PropertyDefinition에 대응하는 propertySchemaV2 항목이 없습니다"));
			}
			var sourceV2 = v2.get(v2Index);
			canonical.set(canonicalIndex, new PropertyDefinition(
					source.id(), source.key(), source.name(), source.type(), source.required(), source.system(),
					source.config(), reorder.order(), source.version() + 1, source.deletedAt()));
			v2.set(v2Index, new CareerPropertyDefinitionV2Snapshot(
					sourceV2.id(), sourceV2.key(), sourceV2.name(), sourceV2.type(), sourceV2.required(),
					sourceV2.system(), sourceV2.config(), reorder.order(), sourceV2.version() + 1,
					sourceV2.deletedAt()));
		}
		var updated = new CareerPropertyCategorySnapshot(
				category.id(), category.userId(), category.key(), category.name(), category.icon(),
				category.defaultView(), category.system(), category.propertySchema(), List.copyOf(v2),
				List.copyOf(canonical), category.schemaVersion() + 1, category.sortOrder(), category.version() + 1);

		if (!repository.saveMutation(
				userId, expectedVersion, updated, idempotencyDigest, requestHash, now)) {
			var raced = repository.findMutationResult(userId, categoryId, idempotencyDigest);
			if (raced.isPresent() && MessageDigest.isEqual(
					raced.get().requestHash().getBytes(StandardCharsets.UTF_8),
					requestHash.getBytes(StandardCharsets.UTF_8))) {
				return raced.get().category();
			}
			throw new CareerPropertyDefinitionConflictException("Category가 동시에 변경되었습니다");
		}
		if (change instanceof CareerPropertyCreateChange create
				&& (create.type() == PropertyDefinitionType.FORMULA
						|| create.type() == PropertyDefinitionType.ROLLUP)) {
			appendComputationEvents(userId, categoryId, updated.schemaVersion(), create, updated);
		}
		return updated;
	}

	private void appendComputationEvents(
			String userId,
			String categoryId,
			long schemaVersion,
			CareerPropertyCreateChange create,
			CareerPropertyCategorySnapshot updated) {
		var propertyId = updated.propertyDefinitions().stream()
				.filter(definition -> definition.key().equals(create.key()) && definition.deletedAt() == null)
				.map(PropertyDefinition::id).findFirst()
				.orElseThrow(() -> new CareerRecordDataIntegrityException(
						new IllegalStateException("생성된 computed PropertyDefinition을 찾을 수 없습니다")));
		var records = repository.findActiveRecords(userId, categoryId, 10_001);
		if (records.size() > 10_000) {
			throw new CareerPropertyDefinitionConflictException("computed Property 재계산 대상이 10000건을 초과합니다");
		}
		for (var record : records) {
			computationOutbox.append(new CareerComputationEvent(
					userId, record.id(), List.of(propertyId), record.version(), Map.of(propertyId, 1L),
					"career-computed-schema:" + categoryId + ":" + propertyId + ":v"
							+ schemaVersion + ":" + record.id()));
		}
	}

	private CareerPropertyCategorySnapshot category(String userId, String categoryId) {
		return repository.findOwnedCustomCategory(userId, categoryId)
				.orElseThrow(CareerRecordNotFoundException::new);
	}

	private CareerPropertyChangeImpact impact(
			String userId,
			CareerPropertyCategorySnapshot category,
			CareerPropertySchemaChange change) {
		var propertyId = propertyId(change);
		if (propertyId == null) {
			return CareerPropertyChangeImpact.empty();
		}
		var source = category.propertyDefinitions().stream()
				.filter(definition -> definition.id().equals(propertyId))
				.findFirst()
				.orElseThrow(CareerRecordNotFoundException::new);
		var affected = repository.countActiveRecordsWithLegacyProperty(
				userId, category.id(), source.key());
		var dependentViews = repository.findDependentViewIds(
				userId, category.id(), source.id());
		var dependentFormulas = dependentDefinitions(category, source.id(), PropertyDefinitionType.FORMULA);
		var dependentRollups = dependentDefinitions(category, source.id(), PropertyDefinitionType.ROLLUP);
		return new CareerPropertyChangeImpact(
				affected, affected, dependentViews, dependentFormulas, dependentRollups);
	}

	private static String propertyId(CareerPropertySchemaChange change) {
		if (change instanceof CareerPropertyRenameChange rename) return rename.propertyId();
		if (change instanceof CareerPropertyReorderChange reorder) return reorder.propertyId();
		return null;
	}

	private static List<String> dependentDefinitions(
			CareerPropertyCategorySnapshot category,
			String propertyId,
			PropertyDefinitionType type) {
		return category.propertyDefinitions().stream()
				.filter(definition -> definition.type() == type)
				.filter(definition -> containsReference(definition.config(), propertyId))
				.map(PropertyDefinition::id)
				.limit(100)
				.toList();
	}

	private static boolean containsReference(Object value, String propertyId) {
		if (propertyId.equals(value)) return true;
		if (value instanceof Map<?, ?> map) {
			return map.values().stream().anyMatch(item -> containsReference(item, propertyId));
		}
		if (value instanceof Iterable<?> iterable) {
			for (var item : iterable) {
				if (containsReference(item, propertyId)) return true;
			}
		}
		return false;
	}

	private static int definitionIndex(List<PropertyDefinition> definitions, String propertyId) {
		for (var index = 0; index < definitions.size(); index++) {
			if (definitions.get(index).id().equals(propertyId)) return index;
		}
		return -1;
	}

	private static int v2DefinitionIndex(
			List<CareerPropertyDefinitionV2Snapshot> definitions, String propertyId) {
		for (var index = 0; index < definitions.size(); index++) {
			if (definitions.get(index).id().equals(propertyId)) return index;
		}
		return -1;
	}

	private static CareerPropertySchemaChange validated(CareerPropertySchemaChange change) {
		if (change == null) {
			throw new CareerRecordValidationException("change는 null일 수 없습니다");
		}
		if (change instanceof CareerPropertyRenameChange rename) {
			uuid(rename.propertyId(), "PropertyDefinition id");
			if (rename.name() == null || rename.name().trim().isEmpty() || rename.name().trim().length() > 80) {
				throw new CareerRecordValidationException("PropertyDefinition name은 1자 이상 80자 이하여야 합니다");
			}
			return new CareerPropertyRenameChange(rename.propertyId(), rename.name().trim());
		}
		if (change instanceof CareerPropertyReorderChange reorder) {
			uuid(reorder.propertyId(), "PropertyDefinition id");
			if (reorder.order() < 0) {
				throw new CareerRecordValidationException("PropertyDefinition order는 0 이상이어야 합니다");
			}
			return reorder;
		}
		if (!(change instanceof CareerPropertyCreateChange create)) {
			throw new CareerRecordValidationException("지원하지 않는 PropertyDefinition 변경입니다");
		}
		if (create.id() != null) {
			uuid(create.id(), "PropertyDefinition id");
		}
		if (create.key() == null || !create.key().matches("^[A-Za-z][A-Za-z0-9_]{0,63}$")) {
			throw new CareerRecordValidationException("PropertyDefinition key 형식이 올바르지 않습니다");
		}
		if (create.name() == null || create.name().trim().isEmpty() || create.name().trim().length() > 80) {
			throw new CareerRecordValidationException("PropertyDefinition name은 1자 이상 80자 이하여야 합니다");
		}
		if (create.type() == null || (!create.type().writable()
				&& create.type() != PropertyDefinitionType.RELATION
				&& create.type() != PropertyDefinitionType.FORMULA
				&& create.type() != PropertyDefinitionType.ROLLUP)) {
			throw new CareerRecordValidationException("지원하지 않는 PropertyDefinition type입니다");
		}
		if (create.order() != null && create.order() < 0) {
			throw new CareerRecordValidationException("PropertyDefinition order는 0 이상이어야 합니다");
		}
		validateConfig(create);
		return new CareerPropertyCreateChange(
				create.id(), create.key(), create.name().trim(), create.type(), create.config(), create.order());
	}

	private static void validateConfig(CareerPropertyCreateChange change) {
		if (change.config() == null) {
			throw new CareerRecordValidationException("PropertyDefinition config는 null일 수 없습니다");
		}
		if (change.type().wireName().equals("select") || change.type().wireName().equals("multi_select")) {
			if (!change.config().keySet().equals(java.util.Set.of("options"))
					|| !(change.config().get("options") instanceof List<?> options)
					|| options.size() > 100) {
				throw new CareerRecordValidationException("select config에는 최대 100개의 options만 허용됩니다");
			}
			var optionIds = new HashSet<String>();
			for (var value : options) {
				if (!(value instanceof Map<?, ?> option)
						|| !option.keySet().equals(java.util.Set.of("id", "name"))
						|| !(option.get("id") instanceof String id)
						|| !(option.get("name") instanceof String name)
						|| name.trim().isEmpty() || name.length() > 80) {
					throw new CareerRecordValidationException("select option 형식이 올바르지 않습니다");
				}
				uuid(id, "select option id");
				if (!optionIds.add(id)) {
					throw new CareerRecordValidationException("select option id를 중복해서 사용할 수 없습니다");
				}
			}
			return;
		}
		if (change.type() == PropertyDefinitionType.RELATION) {
			if (!change.config().keySet().equals(java.util.Set.of(
					"targetCategoryId", "inversePropertyId", "cardinality", "deletePolicy"))) {
				throw new CareerRecordValidationException("relation config 필드 구성이 올바르지 않습니다");
			}
			uuid(stringConfig(change.config().get("targetCategoryId"), "targetCategoryId"), "targetCategoryId");
			var inverse = change.config().get("inversePropertyId");
			if (inverse != null) uuid(stringConfig(inverse, "inversePropertyId"), "inversePropertyId");
			if (!(change.config().get("cardinality") instanceof String cardinality)
					|| !List.of("single", "multiple").contains(cardinality)) {
				throw new CareerRecordValidationException("relation cardinality 값이 올바르지 않습니다");
			}
			if (!(change.config().get("deletePolicy") instanceof String deletePolicy)
					|| !List.of("restrict", "nullify").contains(deletePolicy)) {
				throw new CareerRecordValidationException("relation deletePolicy 값이 올바르지 않습니다");
			}
			return;
		}
		if (change.type() == PropertyDefinitionType.FORMULA) {
			validateFormulaConfig(change.config());
			return;
		}
		if (change.type() == PropertyDefinitionType.ROLLUP) {
			if (!change.config().keySet().equals(java.util.Set.of(
					"relationPropertyId", "targetPropertyId", "aggregation"))) {
				throw new CareerRecordValidationException("rollup config 필드 구성이 올바르지 않습니다");
			}
			uuid(stringConfig(change.config().get("relationPropertyId"), "relationPropertyId"),
					"relationPropertyId");
			uuid(stringConfig(change.config().get("targetPropertyId"), "targetPropertyId"),
					"targetPropertyId");
			if (!(change.config().get("aggregation") instanceof String aggregation)
					|| !List.of("count", "unique_count", "sum", "average", "min", "max",
							"earliest", "latest", "percent_checked", "show_unique").contains(aggregation)) {
				throw new CareerRecordValidationException("rollup aggregation 값이 올바르지 않습니다");
			}
			return;
		}
		if (!change.config().isEmpty()) {
			throw new CareerRecordValidationException("이 Property type의 config는 빈 객체여야 합니다");
		}
	}

	private static void validateFormulaConfig(Map<String, Object> config) {
		if (!config.keySet().equals(java.util.Set.of("source", "ast", "diagnostics"))
				|| !(config.get("source") instanceof String source)
				|| source.length() > 4_000
				|| source.matches("(?s).*\\b(?:eval|Function|import|require)\\s*\\(.*")
				|| !(config.get("diagnostics") instanceof List<?> diagnostics)
				|| diagnostics.size() > 50) {
			throw new CareerRecordValidationException("formula config가 올바르지 않습니다");
		}
		for (var item : diagnostics) {
			if (!(item instanceof Map<?, ?> diagnostic)
					|| !diagnostic.keySet().equals(java.util.Set.of("code", "message", "severity", "start", "end"))
					|| !(diagnostic.get("code") instanceof String code) || code.isEmpty() || code.length() > 80
					|| !(diagnostic.get("message") instanceof String message) || message.isEmpty() || message.length() > 500
					|| !(diagnostic.get("severity") instanceof String severity)
					|| !List.of("error", "warning").contains(severity)
					|| !(diagnostic.get("start") instanceof Number start)
					|| !(diagnostic.get("end") instanceof Number end)
					|| start.longValue() < 0 || end.longValue() < start.longValue()
					|| start.doubleValue() != start.longValue() || end.doubleValue() != end.longValue()
					|| "error".equals(severity)) {
				throw new CareerRecordValidationException("formula diagnostics가 올바르지 않습니다");
			}
		}
	}

	private void validateSpecialCreateReferences(
			String userId,
			CareerPropertyCategorySnapshot sourceCategory,
			CareerPropertySchemaChange change) {
		if (!(change instanceof CareerPropertyCreateChange create)) return;
		if (create.type() == PropertyDefinitionType.ROLLUP) {
			validateRollupReferences(userId, sourceCategory, create);
			return;
		}
		if (create.type() != PropertyDefinitionType.RELATION) return;
		var targetCategoryId = (String) create.config().get("targetCategoryId");
		var target = repository.findAccessibleCategory(userId, targetCategoryId)
				.orElseThrow(() -> new CareerRecordValidationException("relation target Category를 찾을 수 없습니다"));
		var inversePropertyId = (String) create.config().get("inversePropertyId");
		if (inversePropertyId == null) return;
		if (create.id() == null) {
			throw new CareerRecordValidationException("inverse relation 생성에는 PropertyDefinition id가 필요합니다");
		}
		var inverse = target.propertyDefinitions().stream()
				.filter(definition -> definition.id().equals(inversePropertyId) && definition.deletedAt() == null)
				.findFirst()
				.orElseThrow(() -> new CareerRecordValidationException("inverse relation PropertyDefinition을 찾을 수 없습니다"));
		if (inverse.type() != PropertyDefinitionType.RELATION
				|| !sourceCategory.id().equals(inverse.config().get("targetCategoryId"))
				|| !create.id().equals(inverse.config().get("inversePropertyId"))) {
			throw new CareerRecordValidationException("inverse relation 설정이 서로 일치하지 않습니다");
		}
	}

	private void validateRollupReferences(
			String userId,
			CareerPropertyCategorySnapshot sourceCategory,
			CareerPropertyCreateChange create) {
		var relationPropertyId = (String) create.config().get("relationPropertyId");
		var relation = sourceCategory.propertyDefinitions().stream()
				.filter(definition -> definition.id().equals(relationPropertyId) && definition.deletedAt() == null)
				.findFirst()
				.orElseThrow(() -> new CareerRecordValidationException("rollup relation PropertyDefinition을 찾을 수 없습니다"));
		if (relation.type() != PropertyDefinitionType.RELATION) {
			throw new CareerRecordValidationException("rollup relationPropertyId는 relation type이어야 합니다");
		}
		var targetCategoryId = relation.config().get("targetCategoryId");
		if (!(targetCategoryId instanceof String targetId)) {
			throw new CareerRecordDataIntegrityException(
					new IllegalStateException("relation targetCategoryId가 올바르지 않습니다"));
		}
		var target = repository.findAccessibleCategory(userId, targetId)
				.orElseThrow(() -> new CareerRecordValidationException("rollup target Category를 찾을 수 없습니다"));
		var targetPropertyId = (String) create.config().get("targetPropertyId");
		if (target.propertyDefinitions().stream().noneMatch(definition ->
				definition.id().equals(targetPropertyId) && definition.deletedAt() == null)) {
			throw new CareerRecordValidationException("rollup target PropertyDefinition을 찾을 수 없습니다");
		}
	}

	private static String stringConfig(Object value, String field) {
		if (value instanceof String text) return text;
		throw new CareerRecordValidationException("relation " + field + "는 문자열이어야 합니다");
	}

	private static void validateIdentity(
			CareerPropertyCategorySnapshot category, String propertyId, String key) {
		var everyDefinition = new ArrayList<CareerPropertyDefinitionV2Snapshot>(category.propertySchemaV2());
		for (var definition : everyDefinition) {
			if (definition.id().equals(propertyId)) {
				throw new CareerPropertyDefinitionConflictException("PropertyDefinition id가 이미 사용 중입니다");
			}
			if (definition.key().equals(key)) {
				throw new CareerPropertyDefinitionConflictException("PropertyDefinition key가 이미 사용 중입니다");
			}
		}
		for (var definition : category.propertyDefinitions()) {
			if (definition.id().equals(propertyId)) {
				throw new CareerPropertyDefinitionConflictException("PropertyDefinition id가 이미 사용 중입니다");
			}
			if (definition.key().equals(key)) {
				throw new CareerPropertyDefinitionConflictException("PropertyDefinition key가 이미 사용 중입니다");
			}
		}
	}

	private static String digest(CareerPropertySchemaChange change) {
		if (change instanceof CareerPropertyRenameChange rename) {
			return digest("change", "rename", rename.propertyId(), rename.name());
		}
		if (change instanceof CareerPropertyReorderChange reorder) {
			return digest("change", "reorder", reorder.propertyId(), Integer.toString(reorder.order()));
		}
		var create = (CareerPropertyCreateChange) change;
		return digest(
				"change",
				create.id() == null ? "" : create.id(),
				create.key(),
				create.name(),
				create.type().wireName(),
				create.order() == null ? "" : Integer.toString(create.order()),
				canonical(create.config()));
	}

	private static String digest(String... values) {
		var canonical = new StringBuilder();
		for (var value : values) {
			canonical.append(value.length()).append(':').append(value);
		}
		try {
			return java.util.HexFormat.of().formatHex(
					MessageDigest.getInstance("SHA-256")
							.digest(canonical.toString().getBytes(StandardCharsets.UTF_8)));
		}
		catch (NoSuchAlgorithmException exception) {
			throw new IllegalStateException("SHA-256을 사용할 수 없습니다", exception);
		}
	}

	private static String canonical(Object value) {
		if (value == null) return "null";
		if (value instanceof String text) return "s" + text.length() + ":" + text;
		if (value instanceof Boolean bool) return bool ? "b1" : "b0";
		if (value instanceof Number number) return "n" + number;
		if (value instanceof List<?> list) {
			return "l[" + list.stream().map(CareerPropertyDefinitionCreateService::canonical)
					.reduce("", (left, right) -> left + right.length() + ":" + right) + "]";
		}
		if (value instanceof Map<?, ?> map) {
			var entries = new ArrayList<Map.Entry<?, ?>>(map.entrySet());
			entries.sort(Comparator.comparing(entry -> String.valueOf(entry.getKey())));
			var result = new StringBuilder("m{");
			for (var entry : entries) {
				var key = String.valueOf(entry.getKey());
				var item = canonical(entry.getValue());
				result.append(key.length()).append(':').append(key).append(item.length()).append(':').append(item);
			}
			return result.append('}').toString();
		}
		throw new CareerRecordValidationException("config에 지원하지 않는 JSON 값이 있습니다");
	}

	private static void uuid(String value, String field) {
		try {
			UUID.fromString(value);
		}
		catch (IllegalArgumentException exception) {
			throw new CareerRecordValidationException(field + "는 UUID여야 합니다");
		}
	}
}

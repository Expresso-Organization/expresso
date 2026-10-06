package com.expresso.backend.career.infrastructure.mongo;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Date;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.bson.Document;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.stereotype.Repository;

import com.expresso.backend.career.application.CareerPropertyCategorySnapshot;
import com.expresso.backend.career.application.CareerPropertyDefinitionCreateRepository;
import com.expresso.backend.career.application.CareerPropertyDefinitionCreateRepository.ActiveRecord;
import com.expresso.backend.career.application.CareerPropertyDefinitionV2Snapshot;
import com.expresso.backend.career.application.CareerPropertyMutationResult;
import com.expresso.backend.career.domain.PropertyDefinition;
import com.expresso.backend.career.domain.PropertyDefinitionType;

@Repository
public class MongoCareerPropertyDefinitionCreateRepository
		implements CareerPropertyDefinitionCreateRepository {

	private static final String COLLECTION = "career_categories";
	private final MongoTemplate mongoTemplate;

	public MongoCareerPropertyDefinitionCreateRepository(MongoTemplate mongoTemplate) {
		this.mongoTemplate = mongoTemplate;
	}

	@Override
	public Optional<CareerPropertyCategorySnapshot> findOwnedCustomCategory(
			String userId, String categoryId) {
		var document = collection().find(new Document("_id", categoryId)
				.append("userId", userId).append("isSystem", false)).first();
		return Optional.ofNullable(document).map(value -> category(value, userId, false));
	}

	@Override
	public Optional<CareerPropertyCategorySnapshot> findAccessibleCategory(
			String userId, String categoryId) {
		var query = Query.query(Criteria.where("_id").is(categoryId)
				.orOperator(
						new Criteria().andOperator(
								Criteria.where("isSystem").is(true),
								Criteria.where("userId").is(null)),
						Criteria.where("userId").is(userId)));
		var document = mongoTemplate.findOne(query, Document.class, COLLECTION);
		return Optional.ofNullable(document).map(value -> category(value, userId, false));
	}

	@Override
	public List<ActiveRecord> findActiveRecords(String userId, String categoryId, int limit) {
		var query = Query.query(Criteria.where("userId").is(userId)
				.and("categoryId").is(categoryId).and("deletedAt").is(null)).limit(limit);
		query.fields().include("_id").include("version");
		return mongoTemplate.find(query, Document.class, "career_records").stream()
				.map(document -> new ActiveRecord(
						requiredString(document, "_id"), requiredLong(document, "version")))
				.toList();
	}

	@Override
	public Optional<CareerPropertyMutationResult> findMutationResult(
			String userId, String categoryId, String idempotencyDigest) {
		var document = collection().find(new Document("_id", categoryId)
				.append("userId", userId).append("isSystem", false)).first();
		if (document == null) return Optional.empty();
		var results = document.get("propertyMutationResults", Document.class);
		if (results == null) return Optional.empty();
		var stored = results.get(idempotencyDigest);
		if (!(stored instanceof Document result)
				|| !(result.get("requestHash") instanceof String requestHash)
				|| !(result.get("category") instanceof Document storedCategory)) {
			return Optional.empty();
		}
		return Optional.of(new CareerPropertyMutationResult(
				requestHash, category(storedCategory, userId, true)));
	}

	@Override
	public long countActiveRecordsWithLegacyProperty(
			String userId, String categoryId, String propertyKey) {
		return mongoTemplate.getCollection("career_records").countDocuments(
				new Document("userId", userId)
						.append("categoryId", categoryId)
						.append("deletedAt", null)
						.append("properties." + propertyKey, new Document("$exists", true)));
	}

	@Override
	public List<String> findDependentViewIds(
			String userId, String categoryId, String propertyId) {
		var result = new ArrayList<String>();
		for (var view : mongoTemplate.getCollection("career_views")
				.find(new Document("userId", userId).append("categoryId", categoryId))
				.limit(21)) {
			if (containsReference(view, propertyId) && view.get("_id") instanceof String id) {
				result.add(id);
			}
		}
		return List.copyOf(result);
	}

	@Override
	public boolean saveMutation(
			String userId,
			long expectedVersion,
			CareerPropertyCategorySnapshot category,
			String idempotencyDigest,
			String requestHash,
			Instant changedAt) {
		var update = new Document("$set", new Document()
				.append("propertySchemaV2", category.propertySchemaV2().stream()
						.map(MongoCareerPropertyDefinitionCreateRepository::v2Document).toList())
				.append("propertyDefinitions", category.propertyDefinitions().stream()
						.map(MongoCareerPropertyDefinitionCreateRepository::canonicalDocument).toList())
				.append("schemaVersion", category.schemaVersion())
				.append("version", category.version())
				.append("updatedAt", Date.from(changedAt))
				.append("propertyMutationResults." + idempotencyDigest,
						new Document("requestHash", requestHash)
								.append("category", wireCategory(category))));
		var result = collection().updateOne(
				new Document("_id", category.id()).append("userId", userId)
						.append("isSystem", false).append("version", expectedVersion),
				update);
		return result.getModifiedCount() == 1;
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

	private CareerPropertyCategorySnapshot category(
			Document document, String userId, boolean storedWireCategory) {
		var version = requiredLong(document, "version");
		var schemaVersion = document.get("schemaVersion") instanceof Number number
				? number.longValue() : version;
		var v2 = v2Definitions(document.get("propertySchemaV2"));
		var canonical = storedWireCategory
				? canonicalFromV2(v2)
				: MongoCareerCategoryProjector.project(document).propertyDefinitions();
		return new CareerPropertyCategorySnapshot(
				requiredString(document, storedWireCategory ? "id" : "_id"),
				userId,
				requiredString(document, "key"),
				requiredString(document, "name"),
				requiredString(document, "icon"),
				requiredString(document, "defaultView"),
				requiredBoolean(document, "isSystem"),
				jsonObject(document.get("propertySchema"), "propertySchema"),
				v2,
				canonical,
				schemaVersion,
				requiredInt(document, "sortOrder"),
				version);
	}

	private static List<PropertyDefinition> canonicalFromV2(
			List<CareerPropertyDefinitionV2Snapshot> definitions) {
		return definitions.stream()
				.filter(definition -> !"title".equals(definition.type()))
				.map(definition -> new PropertyDefinition(
						definition.id(), definition.key(), definition.name(),
						PropertyDefinitionType.fromStoredName(definition.type()),
						definition.required(), definition.system(), definition.config(),
						definition.order(), definition.version(), definition.deletedAt()))
				.toList();
	}

	private static List<CareerPropertyDefinitionV2Snapshot> v2Definitions(Object value) {
		if (!(value instanceof List<?> list)) {
			throw new IllegalStateException("propertySchemaV2는 배열이어야 합니다");
		}
		var result = new ArrayList<CareerPropertyDefinitionV2Snapshot>();
		for (var item : list) {
			if (!(item instanceof Document document)) {
				throw new IllegalStateException("propertySchemaV2 항목은 객체여야 합니다");
			}
			result.add(new CareerPropertyDefinitionV2Snapshot(
					requiredString(document, "id"),
					requiredString(document, "key"),
					requiredString(document, "name"),
					requiredString(document, "type"),
					requiredBoolean(document, "required"),
					requiredBoolean(document, "system"),
					jsonObject(document.get("config"), "propertySchemaV2.config"),
					requiredInt(document, "order"),
					requiredLong(document, "version"),
					nullableInstant(document.get("deletedAt"))));
		}
		return List.copyOf(result);
	}

	private static Document wireCategory(CareerPropertyCategorySnapshot category) {
		return new Document("id", category.id())
				.append("key", category.key())
				.append("name", category.name())
				.append("icon", category.icon())
				.append("defaultView", category.defaultView())
				.append("isSystem", category.system())
				.append("propertySchema", new Document(category.propertySchema()))
				.append("propertySchemaV2", category.propertySchemaV2().stream()
						.map(MongoCareerPropertyDefinitionCreateRepository::v2Document).toList())
				.append("schemaVersion", category.schemaVersion())
				.append("sortOrder", category.sortOrder())
				.append("recordCount", 0)
				.append("version", category.version());
	}

	private static Document canonicalDocument(PropertyDefinition definition) {
		return new Document("id", definition.id())
				.append("key", definition.key())
				.append("name", definition.name())
				.append("type", definition.type().wireName())
				.append("required", definition.required())
				.append("system", definition.system())
				.append("config", new Document(definition.config()))
				.append("order", definition.order())
				.append("version", definition.version())
				.append("deletedAt", definition.deletedAt() == null ? null : definition.deletedAt().toString());
	}

	private static Document v2Document(CareerPropertyDefinitionV2Snapshot definition) {
		return new Document("id", definition.id())
				.append("key", definition.key())
				.append("name", definition.name())
				.append("type", definition.type())
				.append("required", definition.required())
				.append("system", definition.system())
				.append("config", new Document(definition.config()))
				.append("order", definition.order())
				.append("version", definition.version())
				.append("deletedAt", definition.deletedAt() == null ? null : definition.deletedAt().toString());
	}

	private static Map<String, Object> jsonObject(Object value, String field) {
		if (!(value instanceof Map<?, ?> map)) {
			throw new IllegalStateException(field + "는 객체여야 합니다");
		}
		var result = new LinkedHashMap<String, Object>();
		for (var entry : map.entrySet()) {
			if (!(entry.getKey() instanceof String key)) {
				throw new IllegalStateException(field + "의 key는 문자열이어야 합니다");
			}
			result.put(key, jsonValue(entry.getValue(), field));
		}
		return java.util.Collections.unmodifiableMap(result);
	}

	private static Object jsonValue(Object value, String field) {
		if (value == null || value instanceof String || value instanceof Boolean || value instanceof Number) {
			return value;
		}
		if (value instanceof List<?> list) {
			return list.stream().map(item -> jsonValue(item, field)).toList();
		}
		if (value instanceof Map<?, ?>) {
			return jsonObject(value, field);
		}
		throw new IllegalStateException(field + "에 지원하지 않는 BSON 값이 있습니다");
	}

	private static String requiredString(Document document, String field) {
		if (document.get(field) instanceof String value) return value;
		throw new IllegalStateException(field + "는 문자열이어야 합니다");
	}

	private static boolean requiredBoolean(Document document, String field) {
		if (document.get(field) instanceof Boolean value) return value;
		throw new IllegalStateException(field + "는 boolean이어야 합니다");
	}

	private static int requiredInt(Document document, String field) {
		if (document.get(field) instanceof Number value) return value.intValue();
		throw new IllegalStateException(field + "는 정수여야 합니다");
	}

	private static long requiredLong(Document document, String field) {
		if (document.get(field) instanceof Number value) return value.longValue();
		throw new IllegalStateException(field + "는 정수여야 합니다");
	}

	private static Instant nullableInstant(Object value) {
		if (value == null) return null;
		if (value instanceof String text) return Instant.parse(text);
		if (value instanceof Date date) return date.toInstant();
		throw new IllegalStateException("deletedAt은 날짜 또는 null이어야 합니다");
	}

	private com.mongodb.client.MongoCollection<Document> collection() {
		return mongoTemplate.getCollection(COLLECTION);
	}
}

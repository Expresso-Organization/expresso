package com.expresso.backend.career.infrastructure.mongo;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.Date;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.bson.Document;
import org.bson.types.Decimal128;

import com.expresso.backend.career.domain.CareerCategory;
import com.expresso.backend.career.domain.PropertyDefinition;
import com.expresso.backend.career.domain.PropertyDefinitionType;

final class MongoCareerCategoryProjector {

	private MongoCareerCategoryProjector() {
	}

	static CareerCategory project(Document document) {
		return new CareerCategory(
				document.getString("_id"),
				document.getString("key"),
				document.getString("name"),
				mapDefinitions(document));
	}

	private static List<PropertyDefinition> mapDefinitions(Document category) {
		var currentDefinitions = documents(category.get("propertyDefinitions"), "propertyDefinitions");
		var v2Definitions = documents(category.get("propertySchemaV2"), "propertySchemaV2");
		var legacySchema = object(category.get("propertySchema"), "propertySchema");

		validateOfficialIdsAgree(category.getString("_id"), v2Definitions, legacySchema);
		if (isCanonicalRich(currentDefinitions)) {
			return mapRichDefinitions(currentDefinitions, "propertyDefinitions");
		}
		if (containsRichDefinitionFields(currentDefinitions)) {
			throw new IllegalStateException("propertyDefinitions의 canonical 필드가 불완전합니다");
		}
		if (v2Definitions != null) {
			return mapRichDefinitions(v2Definitions, "propertySchemaV2");
		}
		if (legacySchema != null) {
			return mapLegacyDefinitions(legacySchema);
		}
		return List.of();
	}

	private static boolean isCanonicalRich(List<Document> definitions) {
		return definitions != null && !definitions.isEmpty()
				&& definitions.stream().allMatch(MongoCareerCategoryProjector::hasEveryRichField);
	}

	private static boolean hasEveryRichField(Document definition) {
		return definition.containsKey("id")
				&& definition.containsKey("key")
				&& definition.containsKey("name")
				&& definition.containsKey("type")
				&& definition.containsKey("required")
				&& definition.containsKey("system")
				&& definition.containsKey("config")
				&& definition.containsKey("order")
				&& definition.containsKey("version")
				&& definition.containsKey("deletedAt");
	}

	private static boolean containsRichDefinitionFields(List<Document> definitions) {
		return definitions != null && definitions.stream().anyMatch(definition ->
				definition.containsKey("name") || definition.containsKey("config")
						|| definition.containsKey("order") || definition.containsKey("version")
						|| definition.containsKey("deletedAt"));
	}

	private static List<PropertyDefinition> mapRichDefinitions(List<Document> definitions, String source) {
		var mapped = new ArrayList<PropertyDefinition>();
		var ids = new HashSet<String>();
		var keys = new HashSet<String>();
		for (var definition : definitions) {
			if (!hasEveryRichField(definition)) {
				throw new IllegalStateException(source + "의 PropertyDefinition 필드가 불완전합니다");
			}
			var id = requiredString(definition, "id", source);
			var key = requiredString(definition, "key", source);
			if (!ids.add(id) || !keys.add(key)) {
				throw new IllegalStateException(source + "에 중복된 PropertyDefinition id 또는 key가 있습니다");
			}
			var storedType = requiredString(definition, "type", source);
			if ("title".equals(storedType)) {
				if ("propertyDefinitions".equals(source)) {
					throw new IllegalStateException("canonical propertyDefinitions에 title을 저장할 수 없습니다");
				}
				continue;
			}
			mapped.add(new PropertyDefinition(
					id,
					key,
					requiredString(definition, "name", source),
					PropertyDefinitionType.fromStoredName(storedType),
					requiredBoolean(definition, "required", source),
					requiredBoolean(definition, "system", source),
					objectOrThrow(definition.get("config"), source + ".config"),
					requiredInt(definition, "order", source),
					requiredLong(definition, "version", source),
					nullableTimestamp(definition.get("deletedAt"), source)));
		}
		return mapped.stream()
				.sorted(Comparator.comparingInt(PropertyDefinition::order).thenComparing(PropertyDefinition::id))
				.toList();
	}

	private static List<PropertyDefinition> mapLegacyDefinitions(Map<String, Object> schema) {
		var definitions = new ArrayList<PropertyDefinition>();
		var order = 0;
		for (var entry : schema.entrySet()) {
			var definition = objectOrThrow(entry.getValue(), "propertySchema." + entry.getKey());
			var type = PropertyDefinitionType.fromStoredName(requiredString(definition, "type", "propertySchema"));
			var config = type == PropertyDefinitionType.MULTI_SELECT
					? Map.<String, Object>of("options", List.of())
					: Map.<String, Object>of();
			definitions.add(new PropertyDefinition(
					requiredString(definition, "id", "propertySchema"),
					entry.getKey(),
					requiredString(definition, "label", "propertySchema"),
					type,
					requiredBoolean(definition, "required", "propertySchema"),
					requiredBoolean(definition, "system", "propertySchema"),
					config,
					order++,
					1,
					null));
		}
		return List.copyOf(definitions);
	}

	private static void validateOfficialIdsAgree(
			String categoryId, List<Document> v2Definitions, Map<String, Object> legacySchema) {
		if (v2Definitions == null || legacySchema == null) {
			return;
		}
		for (var v2Definition : v2Definitions) {
			var key = requiredString(v2Definition, "key", "propertySchemaV2");
			var legacyValue = legacySchema.get(key);
			if (legacyValue == null) {
				continue;
			}
			var legacyDefinition = objectOrThrow(legacyValue, "propertySchema." + key);
			var v2Id = requiredString(v2Definition, "id", "propertySchemaV2");
			var legacyId = requiredString(legacyDefinition, "id", "propertySchema");
			if (!v2Id.equals(legacyId)) {
				throw new IllegalStateException("Category " + categoryId
						+ "의 propertySchema와 propertySchemaV2의 id가 일치하지 않습니다: " + key);
			}
		}
	}

	private static List<Document> documents(Object value, String field) {
		if (value == null) {
			return null;
		}
		if (!(value instanceof List<?> list)) {
			throw new IllegalStateException(field + "는 배열이어야 합니다");
		}
		var documents = new ArrayList<Document>(list.size());
		for (var item : list) {
			if (!(item instanceof Document document)) {
				throw new IllegalStateException(field + "의 항목은 객체여야 합니다");
			}
			documents.add(document);
		}
		return List.copyOf(documents);
	}

	private static Map<String, Object> object(Object value, String field) {
		if (value == null) {
			return null;
		}
		return objectOrThrow(value, field);
	}

	private static Map<String, Object> objectOrThrow(Object value, String field) {
		if (!(value instanceof Map<?, ?> map)) {
			throw new IllegalStateException(field + "는 객체여야 합니다");
		}
		var copy = new LinkedHashMap<String, Object>();
		for (var entry : map.entrySet()) {
			if (!(entry.getKey() instanceof String key)) {
				throw new IllegalStateException(field + "의 key는 문자열이어야 합니다");
			}
			copy.put(key, readJsonValue(entry.getValue(), field));
		}
		return copy;
	}

	private static Object readJsonValue(Object value, String field) {
		if (value == null || value instanceof String || value instanceof Boolean) {
			return value;
		}
		if (value instanceof Byte || value instanceof Short || value instanceof Integer || value instanceof Long) {
			return ((Number) value).longValue();
		}
		if (value instanceof Decimal128 decimal) {
			if (!decimal.isFinite()) {
				throw new IllegalStateException(field + "의 숫자는 유한해야 합니다");
			}
			return decimal.bigDecimalValue();
		}
		if (value instanceof BigDecimal decimal) {
			return decimal;
		}
		if (value instanceof Float floating) {
			if (!Float.isFinite(floating)) {
				throw new IllegalStateException(field + "의 숫자는 유한해야 합니다");
			}
			return BigDecimal.valueOf(floating.doubleValue());
		}
		if (value instanceof Double floating) {
			if (!Double.isFinite(floating)) {
				throw new IllegalStateException(field + "의 숫자는 유한해야 합니다");
			}
			return BigDecimal.valueOf(floating);
		}
		if (value instanceof List<?> list) {
			var result = new ArrayList<>(list.size());
			for (var item : list) {
				result.add(readJsonValue(item, field));
			}
			return result;
		}
		if (value instanceof Map<?, ?>) {
			return objectOrThrow(value, field);
		}
		throw new IllegalStateException(field + "에 지원하지 않는 BSON 값이 있습니다: "
				+ value.getClass().getSimpleName());
	}

	private static String requiredString(Map<String, Object> document, String field, String source) {
		var value = document.get(field);
		if (value instanceof String string) {
			return string;
		}
		throw new IllegalStateException(source + "." + field + "는 문자열이어야 합니다");
	}

	private static boolean requiredBoolean(Map<String, Object> document, String field, String source) {
		var value = document.get(field);
		if (value instanceof Boolean bool) {
			return bool;
		}
		throw new IllegalStateException(source + "." + field + "는 boolean이어야 합니다");
	}

	private static int requiredInt(Map<String, Object> document, String field, String source) {
		var value = document.get(field);
		if (value instanceof Number number) {
			return number.intValue();
		}
		throw new IllegalStateException(source + "." + field + "는 정수여야 합니다");
	}

	private static long requiredLong(Map<String, Object> document, String field, String source) {
		var value = document.get(field);
		if (value instanceof Number number) {
			return number.longValue();
		}
		throw new IllegalStateException(source + "." + field + "는 정수여야 합니다");
	}

	private static Instant nullableTimestamp(Object value, String source) {
		if (value == null) {
			return null;
		}
		if (value instanceof String string) {
			try {
				return Instant.parse(string);
			}
			catch (java.time.format.DateTimeParseException exception) {
				throw new IllegalStateException(source + ".deletedAt 형식이 올바르지 않습니다", exception);
			}
		}
		if (value instanceof Date date) {
			return date.toInstant();
		}
		throw new IllegalStateException(source + ".deletedAt은 날짜 또는 null이어야 합니다");
	}

}

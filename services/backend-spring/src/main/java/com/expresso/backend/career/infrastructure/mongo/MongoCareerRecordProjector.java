package com.expresso.backend.career.infrastructure.mongo;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Date;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

import org.bson.Document;
import org.bson.types.Decimal128;

import com.expresso.backend.career.domain.BlockBody;
import com.expresso.backend.career.domain.CareerRecord;
import com.expresso.backend.career.domain.PropertyValue;
import com.expresso.backend.career.domain.PropertyValueType;
import com.expresso.backend.career.domain.SemanticBlock;
import com.expresso.backend.career.domain.TextMark;
import com.expresso.backend.career.domain.TextSpan;
import com.expresso.backend.career.domain.TextualPropertyValue;

final class MongoCareerRecordProjector {

	CareerRecord project(Document document) {
		Objects.requireNonNull(document, "document는 null일 수 없습니다");
		requireCompleteCanonicalContent(document);

		return new CareerRecord(
				requiredString(document, "_id"),
				requiredString(document, "userId"),
				requiredString(document, "categoryId"),
				requiredString(document, "title"),
				projectPropertyValues(requiredList(document, "propertyValues")),
				projectBlockBody(requiredDocument(document, "blockBody")),
				requiredLong(document, "version"),
				requiredInstant(document, "updatedAt"));
	}

	private static void requireCompleteCanonicalContent(Document document) {
		if (!document.containsKey("propertyValues") || !document.containsKey("blockBody")) {
			throw projectionFailure("propertyValues와 blockBody가 모두 있어야 합니다");
		}
	}

	private static List<PropertyValue> projectPropertyValues(List<?> documents) {
		var values = new ArrayList<PropertyValue>(documents.size());
		for (var value : documents) {
			var valueDocument = asDocument(value, "propertyValues 항목");
			requireConstant(valueDocument, "type", "text");
			values.add(new TextualPropertyValue(
					requiredString(valueDocument, "propertyDefinitionId"),
					PropertyValueType.TEXT,
					requiredString(valueDocument, "value")));
		}
		return values;
	}

	private static BlockBody projectBlockBody(Document document) {
		requireConstant(document, "schemaVersion", 1L);
		requireConstant(document, "type", "doc");

		try {
			var content = requiredList(document, "content");
			var blocks = new ArrayList<SemanticBlock>(content.size());
			for (var block : content) {
				blocks.add(projectBlock(asDocument(block, "blockBody content 항목")));
			}
			return new BlockBody(blocks);
		}
		catch (IllegalArgumentException exception) {
			throw projectionFailure("blockBody가 canonical invariant를 위반했습니다", exception);
		}
	}

	private static SemanticBlock projectBlock(Document document) {
		var children = optionalList(document, "content");
		var content = new ArrayList<SemanticBlock>(children.size());
		for (var child : children) {
			content.add(projectBlock(asDocument(child, "block content 항목")));
		}

		var textDocuments = optionalList(document, "text");
		var text = new ArrayList<TextSpan>(textDocuments.size());
		for (var span : textDocuments) {
			text.add(projectTextSpan(asDocument(span, "block text 항목")));
		}
		return new SemanticBlock(
				requiredString(document, "id"),
				requiredString(document, "type"),
				readJsonObject(document.get("attrs"), "block attrs"),
				content,
				text);
	}

	private static TextSpan projectTextSpan(Document document) {
		var markDocuments = optionalList(document, "marks");
		var marks = new ArrayList<TextMark>(markDocuments.size());
		for (var mark : markDocuments) {
			marks.add(projectTextMark(asDocument(mark, "text mark 항목")));
		}
		return new TextSpan(requiredString(document, "text"), marks);
	}

	private static TextMark projectTextMark(Document document) {
		var attrs = document.containsKey("attrs")
				? readJsonObject(document.get("attrs"), "mark attrs")
				: Map.<String, Object>of();
		return new TextMark(requiredString(document, "type"), attrs);
	}

	private static Map<String, Object> readJsonObject(Object value, String field) {
		if (!(value instanceof Map<?, ?> map)) {
			throw projectionFailure(field + "는 객체여야 합니다");
		}
		var result = new LinkedHashMap<String, Object>();
		for (var entry : map.entrySet()) {
			if (!(entry.getKey() instanceof String key)) {
				throw projectionFailure(field + "의 모든 key는 문자열이어야 합니다");
			}
			result.put(key, readJsonValue(entry.getValue(), field));
		}
		return result;
	}

	private static Object readJsonValue(Object value, String field) {
		if (value == null || value instanceof String || value instanceof Boolean) {
			return value;
		}
		if (value instanceof Byte || value instanceof Short || value instanceof Integer || value instanceof Long) {
			return ((Number) value).longValue();
		}
		if (value instanceof Decimal128 decimal) {
			if (!decimal.isFinite()) throw projectionFailure(field + "의 숫자는 유한해야 합니다");
			return decimal.bigDecimalValue();
		}
		if (value instanceof BigDecimal decimal) {
			return decimal;
		}
		if (value instanceof Float floating) {
			if (!Float.isFinite(floating)) throw projectionFailure(field + "의 숫자는 유한해야 합니다");
			return BigDecimal.valueOf(floating.doubleValue());
		}
		if (value instanceof Double floating) {
			if (!Double.isFinite(floating)) throw projectionFailure(field + "의 숫자는 유한해야 합니다");
			return BigDecimal.valueOf(floating);
		}
		if (value instanceof List<?> list) {
			var result = new ArrayList<>(list.size());
			for (var item : list) result.add(readJsonValue(item, field));
			return result;
		}
		if (value instanceof Map<?, ?>) {
			return readJsonObject(value, field);
		}
		throw projectionFailure(field + "에 지원하지 않는 BSON 값이 있습니다: "
				+ value.getClass().getSimpleName());
	}

	private static void requireConstant(Document document, String field, String expected) {
		if (!expected.equals(document.get(field))) {
			throw projectionFailure(field + " 값은 " + expected + "이어야 합니다");
		}
	}

	private static void requireConstant(Document document, String field, long expected) {
		if (requiredLong(document, field) != expected) {
			throw projectionFailure(field + " 값은 " + expected + "이어야 합니다");
		}
	}

	private static String requiredString(Document document, String field) {
		var value = document.get(field);
		if (!(value instanceof String stringValue)) {
			throw projectionFailure(field + "는 문자열이어야 합니다");
		}
		return stringValue;
	}

	private static List<?> requiredList(Document document, String field) {
		var value = document.get(field);
		if (!(value instanceof List<?> listValue)) {
			throw projectionFailure(field + "는 배열이어야 합니다");
		}
		return listValue;
	}

	private static List<?> optionalList(Document document, String field) {
		return document.containsKey(field) ? requiredList(document, field) : List.of();
	}

	private static Document requiredDocument(Document document, String field) {
		return asDocument(document.get(field), field);
	}

	private static Document asDocument(Object value, String field) {
		if (!(value instanceof Document documentValue)) {
			throw projectionFailure(field + "는 객체여야 합니다");
		}
		return documentValue;
	}

	private static long requiredLong(Document document, String field) {
		var value = document.get(field);
		if (!(value instanceof Byte || value instanceof Short || value instanceof Integer || value instanceof Long)) {
			throw projectionFailure(field + "는 정수여야 합니다");
		}
		return ((Number) value).longValue();
	}

	private static Instant requiredInstant(Document document, String field) {
		var value = document.get(field);
		if (!(value instanceof Date dateValue)) {
			throw projectionFailure(field + "는 날짜여야 합니다");
		}
		return dateValue.toInstant();
	}

	private static IllegalStateException projectionFailure(String reason) {
		return new IllegalStateException("Mongo CareerRecord를 Domain으로 변환할 수 없습니다: " + reason);
	}

	private static IllegalStateException projectionFailure(String reason, Throwable cause) {
		return new IllegalStateException("Mongo CareerRecord를 Domain으로 변환할 수 없습니다: " + reason, cause);
	}

}

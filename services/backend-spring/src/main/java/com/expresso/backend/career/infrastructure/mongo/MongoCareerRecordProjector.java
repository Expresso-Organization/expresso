package com.expresso.backend.career.infrastructure.mongo;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Objects;

import org.bson.Document;
import org.bson.types.Decimal128;

import com.expresso.backend.career.domain.*;

final class MongoCareerRecordProjector {
    CareerRecord project(Document document) {
        Objects.requireNonNull(document, "document는 null일 수 없습니다");
        return new CareerRecord(
                requiredString(document, "_id"),
                requiredString(document, "userId"),
                requiredString(document, "categoryId"),
                requiredString(document, "title"),
                projectPropertyValues(requiredList(document, "propertyValues")),
                CareerRecordStatus.fromWireName(requiredString(document, "status")),
                requiredLong(document, "version"),
                requiredInstant(document, "updatedAt"));
    }

	private static List<PropertyValue> projectPropertyValues(List<?> documents) {
		var values = new ArrayList<PropertyValue>(documents.size());
		for (var value : documents) {
			try {
				values.add(projectPropertyValue(asDocument(value, "propertyValues 항목")));
			}
			catch (IllegalArgumentException exception) {
				throw projectionFailure("propertyValues 항목이 canonical invariant를 위반했습니다", exception);
			}
		}
		return values;
	}

	static PropertyValue projectPropertyValue(Document document) {
		requireExactFields(document, List.of("propertyDefinitionId", "type", "value"), "propertyValues 항목");
		var propertyDefinitionId = requiredString(document, "propertyDefinitionId");
		var type = requiredPropertyValueType(document);
		var value = document.get("value");
		return switch (type) {
			case TEXT, URL, EMAIL, PHONE -> new TextualPropertyValue(
					propertyDefinitionId, type, requiredString(document, "value"));
			case NUMBER -> new NumberPropertyValue(propertyDefinitionId, requiredDecimal(value, "value"));
			case CHECKBOX -> new CheckboxPropertyValue(propertyDefinitionId, requiredBoolean(value, "value"));
			case SELECT -> new SelectPropertyValue(
					propertyDefinitionId, value == null ? null : requiredString(document, "value"));
			case MULTI_SELECT -> new MultiSelectPropertyValue(
					propertyDefinitionId, requiredStringList(value, "value"));
			case DATE -> projectDatePropertyValue(propertyDefinitionId, value);
			case FILE, MEDIA -> new AssetPropertyValue(
					propertyDefinitionId, type, requiredStringList(value, "value"));
		};
	}

	private static PropertyValueType requiredPropertyValueType(Document document) {
		var storedType = requiredString(document, "type");
		try {
			return PropertyValueType.valueOf(storedType.toUpperCase(java.util.Locale.ROOT));
		}
		catch (IllegalArgumentException exception) {
			throw projectionFailure("지원하지 않는 PropertyValue type입니다: " + storedType, exception);
		}
	}

	private static DatePropertyValue projectDatePropertyValue(String propertyDefinitionId, Object value) {
		var date = asDocument(value, "date value");
		var precisionName = requiredString(date, "precision");
		final DatePropertyValue.Precision precision;
		try {
			precision = DatePropertyValue.Precision.valueOf(precisionName.toUpperCase(java.util.Locale.ROOT));
		}
		catch (IllegalArgumentException exception) {
			throw projectionFailure("지원하지 않는 date precision입니다: " + precisionName, exception);
		}
		var fields = precision == DatePropertyValue.Precision.DATETIME
				? List.of("precision", "start", "end", "timezone")
				: List.of("precision", "start", "end");
		requireExactFields(date, fields, "date value");
		return new DatePropertyValue(
				propertyDefinitionId,
				precision,
				requiredString(date, "start"),
				nullableString(date.get("end"), "date end"),
				precision == DatePropertyValue.Precision.DATETIME
						? nullableString(date.get("timezone"), "date timezone")
						: null);
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

	private static String nullableString(Object value, String field) {
		if (value == null) {
			return null;
		}
		if (value instanceof String stringValue) {
			return stringValue;
		}
		throw projectionFailure(field + "는 문자열 또는 null이어야 합니다");
	}

	private static boolean requiredBoolean(Object value, String field) {
		if (value instanceof Boolean booleanValue) {
			return booleanValue;
		}
		throw projectionFailure(field + "는 boolean이어야 합니다");
	}

	private static BigDecimal requiredDecimal(Object value, String field) {
		if (value instanceof Decimal128 decimal) {
			if (!decimal.isFinite()) throw projectionFailure(field + "의 숫자는 유한해야 합니다");
			return decimal.bigDecimalValue();
		}
		if (value instanceof BigDecimal decimal) {
			return decimal;
		}
		if (value instanceof Byte || value instanceof Short || value instanceof Integer || value instanceof Long) {
			return BigDecimal.valueOf(((Number) value).longValue());
		}
		if (value instanceof Float floating) {
			if (!Float.isFinite(floating)) throw projectionFailure(field + "의 숫자는 유한해야 합니다");
			return BigDecimal.valueOf(floating.doubleValue());
		}
		if (value instanceof Double floating) {
			if (!Double.isFinite(floating)) throw projectionFailure(field + "의 숫자는 유한해야 합니다");
			return BigDecimal.valueOf(floating);
		}
		throw projectionFailure(field + "는 BSON number여야 합니다");
	}

	private static List<String> requiredStringList(Object value, String field) {
		if (!(value instanceof List<?> list)) {
			throw projectionFailure(field + "는 배열이어야 합니다");
		}
		var strings = new ArrayList<String>(list.size());
		for (var item : list) {
			if (!(item instanceof String stringValue)) {
				throw projectionFailure(field + "의 모든 항목은 문자열이어야 합니다");
			}
			strings.add(stringValue);
		}
		return strings;
	}

	private static void requireExactFields(Document document, List<String> fields, String field) {
		if (document.size() != fields.size() || !document.keySet().containsAll(fields)) {
			throw projectionFailure(field + " 필드 구성이 올바르지 않습니다");
		}
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

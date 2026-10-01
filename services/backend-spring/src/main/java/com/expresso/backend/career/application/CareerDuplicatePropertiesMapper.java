package com.expresso.backend.career.application;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import com.expresso.backend.career.domain.AssetPropertyValue;
import com.expresso.backend.career.domain.CheckboxPropertyValue;
import com.expresso.backend.career.domain.DatePropertyValue;
import com.expresso.backend.career.domain.MultiSelectPropertyValue;
import com.expresso.backend.career.domain.NumberPropertyValue;
import com.expresso.backend.career.domain.PropertyDefinition;
import com.expresso.backend.career.domain.PropertyDefinitionType;
import com.expresso.backend.career.domain.PropertyValue;
import com.expresso.backend.career.domain.PropertyValueType;
import com.expresso.backend.career.domain.SelectPropertyValue;
import com.expresso.backend.career.domain.TextualPropertyValue;

public final class CareerDuplicatePropertiesMapper {

	public record Option(String id, String name) {
	}

	record Result(List<PropertyValue> propertyValues, Map<String, List<Option>> newOptionsByDefinitionId) {
		Result {
			propertyValues = List.copyOf(propertyValues);
			newOptionsByDefinitionId = Map.copyOf(newOptionsByDefinitionId);
		}
	}

	Result map(List<PropertyDefinition> definitions, Map<String, Object> properties) {
		var activeByKey = new LinkedHashMap<String, PropertyDefinition>();
		for (var definition : definitions) {
			if (definition.deletedAt() == null) activeByKey.put(definition.key(), definition);
		}
		var values = new ArrayList<PropertyValue>();
		var additions = new LinkedHashMap<String, List<Option>>();
		for (var entry : properties.entrySet()) {
			var definition = activeByKey.get(entry.getKey());
			if (definition == null || !definition.type().writable()) {
				throw new CareerRecordValidationException("현재 Category에서 사용할 수 없는 property key입니다: " + entry.getKey());
			}
			values.add(value(definition, entry.getValue(), additions));
		}
		for (var definition : activeByKey.values()) {
			if (definition.required() && definition.type().writable() && !properties.containsKey(definition.key())) {
				throw new CareerRecordValidationException("required PropertyValue가 없습니다: " + definition.key());
			}
		}
		return new Result(values, additions);
	}

	private PropertyValue value(
			PropertyDefinition definition,
			Object raw,
			Map<String, List<Option>> additions) {
		var typed = raw instanceof Map<?, ?> map && map.keySet().equals(java.util.Set.of("type", "value"));
		if (raw instanceof Map<?, ?> map && (map.containsKey("type") || map.containsKey("value")) && !typed) {
			throw new CareerRecordValidationException(
					"typed PropertyValue에는 type과 value만 사용할 수 있습니다: " + definition.key());
		}
		var actual = typed ? ((Map<?, ?>) raw).get("value") : raw;
		if (typed && !definition.type().wireName().equals(((Map<?, ?>) raw).get("type"))) {
			throw new CareerRecordValidationException("PropertyValue type이 Definition과 일치하지 않습니다: " + definition.key());
		}
		try {
			return switch (definition.type()) {
				case TEXT -> new TextualPropertyValue(
						definition.id(), PropertyValueType.valueOf(definition.type().name()),
						typed ? string(actual, definition.key()) : legacyText(actual, definition.key()));
				case URL, EMAIL, PHONE -> {
					requireTyped(typed, definition);
					yield new TextualPropertyValue(
							definition.id(), PropertyValueType.valueOf(definition.type().name()), string(actual, definition.key()));
				}
				case NUMBER -> new NumberPropertyValue(definition.id(), decimal(actual, definition.key()));
				case CHECKBOX -> new CheckboxPropertyValue(definition.id(), bool(actual, definition.key()));
				case SELECT -> {
					requireTyped(typed, definition);
					yield new SelectPropertyValue(definition.id(), nullableUuid(actual, definition.key()));
				}
				case MULTI_SELECT -> new MultiSelectPropertyValue(
						definition.id(), typed
								? uuidList(actual, definition.key())
								: optionIds(actual, definition, additions));
				case DATE -> date(definition.id(), actual, definition.key(), typed);
				case FILE, MEDIA -> {
					requireTyped(typed, definition);
					yield new AssetPropertyValue(
							definition.id(), PropertyValueType.valueOf(definition.type().name()), uuidList(actual, definition.key()));
				}
				default -> throw new CareerRecordValidationException(
						"읽기 전용 PropertyDefinition은 복제할 수 없습니다: " + definition.key());
			};
		}
		catch (IllegalArgumentException error) {
			throw new CareerRecordValidationException("PropertyValue가 Definition 계약과 일치하지 않습니다: " + definition.key());
		}
	}

	private List<String> optionIds(
			Object value,
			PropertyDefinition definition,
			Map<String, List<Option>> additions) {
		if (!(value instanceof List<?> list) || list.size() > 100) {
			throw new CareerRecordValidationException("multi_select 값은 최대 100개의 배열이어야 합니다: " + definition.key());
		}
		var knownById = new LinkedHashMap<String, String>();
		var knownByName = new LinkedHashMap<String, String>();
		for (var option : options(definition)) {
			var previousName = knownById.putIfAbsent(option.id(), option.name());
			var previousId = knownByName.putIfAbsent(option.name(), option.id());
			if ((previousName != null && !previousName.equals(option.name()))
					|| (previousId != null && !previousId.equals(option.id()))) {
				throw new CareerRecordDataIntegrityException(
						new IllegalStateException("select option identity가 충돌합니다: " + definition.key()));
			}
		}
		var result = new ArrayList<String>();
		for (var item : list) {
			if (!(item instanceof String text) || text.isBlank() || text.length() > 200) {
				throw new CareerRecordValidationException(
						"multi_select option은 공백이 아니며 200자 이하여야 합니다: " + definition.key());
			}
			var id = knownByName.get(text);
			if (id == null) {
				id = CareerExactOptionIdentity.from(definition.id(), text);
				var option = new Option(id, text);
				additions.computeIfAbsent(definition.id(), ignored -> new ArrayList<>()).add(option);
				knownById.put(id, text);
				knownByName.put(text, id);
			}
			result.add(id);
		}
		return result;
	}

	private static String nullableUuid(Object value, String key) {
		if (value == null) return null;
		var id = string(value, key);
		if (!isUuid(id)) throw new CareerRecordValidationException("select option id가 UUID가 아닙니다: " + key);
		return id;
	}

	private static List<Option> options(PropertyDefinition definition) {
		if (!(definition.config().get("options") instanceof List<?> list)) return List.of();
		var result = new ArrayList<Option>();
		for (var raw : list) {
			if (!(raw instanceof Map<?, ?> option)
					|| !(option.get("id") instanceof String id)
					|| !(option.get("name") instanceof String name)) {
				throw new CareerRecordDataIntegrityException(
						new IllegalStateException("select option shape가 올바르지 않습니다"));
			}
			result.add(new Option(id, name));
		}
		return result;
	}

	private static DatePropertyValue date(String definitionId, Object value, String key, boolean typed) {
		if (value instanceof String month) {
			if (typed) throw new CareerRecordValidationException("typed date 값 형식이 올바르지 않습니다: " + key);
			YearMonth.parse(month);
			return new DatePropertyValue(definitionId, DatePropertyValue.Precision.MONTH, month, null, null);
		}
		if (!typed || !(value instanceof Map<?, ?> map)
				|| !map.keySet().equals(java.util.Set.of("start", "end", "timezone"))
				|| !(map.get("start") instanceof String start)
				) {
			throw new CareerRecordValidationException("date 값 형식이 올바르지 않습니다: " + key);
		}
		var end = map.get("end") == null ? null : string(map.get("end"), key);
		var timezone = map.get("timezone") == null ? null : string(map.get("timezone"), key);
		var precision = start.contains("T") ? DatePropertyValue.Precision.DATETIME : DatePropertyValue.Precision.DAY;
		if (precision == DatePropertyValue.Precision.DAY) LocalDate.parse(start);
		else OffsetDateTime.parse(start);
		return new DatePropertyValue(
				definitionId, precision, start, end,
				precision == DatePropertyValue.Precision.DATETIME ? timezone : null);
	}

	private static BigDecimal decimal(Object value, String key) {
		if (value instanceof Number number) return new BigDecimal(number.toString());
		throw new CareerRecordValidationException("number 값 형식이 올바르지 않습니다: " + key);
	}

	private static boolean bool(Object value, String key) {
		if (value instanceof Boolean result) return result;
		throw new CareerRecordValidationException("checkbox 값 형식이 올바르지 않습니다: " + key);
	}

	private static String string(Object value, String key) {
		if (value instanceof String result) return result;
		throw new CareerRecordValidationException("문자열 값 형식이 올바르지 않습니다: " + key);
	}

	private static String legacyText(Object value, String key) {
		var text = string(value, key);
		if (text.length() > 5_000) {
			throw new CareerRecordValidationException("legacy text 값은 5000자를 초과할 수 없습니다: " + key);
		}
		return text;
	}

	private static List<String> uuidList(Object value, String key) {
		if (!(value instanceof List<?> list)) throw new CareerRecordValidationException("asset 값은 배열이어야 합니다: " + key);
		return list.stream().map(item -> string(item, key)).toList();
	}

	private static void requireTyped(boolean typed, PropertyDefinition definition) {
		if (!typed) {
			throw new CareerRecordValidationException(
					definition.type().wireName() + " 값은 typed PropertyValue여야 합니다: " + definition.key());
		}
	}

	private static boolean isUuid(String value) {
		try {
			return UUID.fromString(value).toString().equalsIgnoreCase(value);
		}
		catch (IllegalArgumentException error) {
			return false;
		}
	}
}

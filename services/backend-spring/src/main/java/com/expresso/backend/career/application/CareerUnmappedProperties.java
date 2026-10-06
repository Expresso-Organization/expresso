package com.expresso.backend.career.application;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Objects;

import com.expresso.backend.career.domain.AssetPropertyValue;
import com.expresso.backend.career.domain.CheckboxPropertyValue;
import com.expresso.backend.career.domain.DatePropertyValue;
import com.expresso.backend.career.domain.MultiSelectPropertyValue;
import com.expresso.backend.career.domain.NumberPropertyValue;
import com.expresso.backend.career.domain.PropertyValue;
import com.expresso.backend.career.domain.SelectPropertyValue;
import com.expresso.backend.career.domain.TextualPropertyValue;

import tools.jackson.databind.ObjectMapper;

public final class CareerUnmappedProperties {

	private static final int MAX_ENTRIES = 200;
	private static final int MAX_UTF8_BYTES = 4 * 1024 * 1024;

	private final Map<String, CareerUnmappedPropertyEnvelope> values;

	public CareerUnmappedProperties(Map<String, CareerUnmappedPropertyEnvelope> values) {
		Objects.requireNonNull(values, "unmappedProperties는 null일 수 없습니다");
		if (values.size() > MAX_ENTRIES) {
			throw new IllegalArgumentException("unmappedProperties는 최대 200개까지 허용됩니다");
		}
		var copy = new LinkedHashMap<String, CareerUnmappedPropertyEnvelope>();
		for (var entry : values.entrySet()) {
			var envelope = Objects.requireNonNull(entry.getValue(), "unmappedProperties 값은 null일 수 없습니다");
			if (!entry.getKey().equals(envelope.propertyValue().propertyDefinitionId())) {
				throw new IllegalArgumentException("unmappedProperties key와 propertyDefinitionId가 일치해야 합니다");
			}
			copy.put(entry.getKey(), envelope);
		}
		if (compactJsonUtf8Bytes(copy) > MAX_UTF8_BYTES) {
			throw new IllegalArgumentException("unmappedProperties는 UTF-8 기준 4 MiB를 초과할 수 없습니다");
		}
		this.values = Map.copyOf(copy);
	}

	public Map<String, CareerUnmappedPropertyEnvelope> values() {
		return values;
	}

	private static int compactJsonUtf8Bytes(Map<String, CareerUnmappedPropertyEnvelope> values) {
		var wire = new LinkedHashMap<String, Object>();
		values.forEach((id, envelope) -> wire.put(id, Map.of(
				"sourceCategoryId", envelope.sourceCategoryId(),
				"propertyValue", wirePropertyValue(envelope.propertyValue()),
				"provenance", Map.of(
						"sourcePropertyKey", envelope.provenance().sourcePropertyKey(),
						"sourcePropertyName", envelope.provenance().sourcePropertyName(),
						"sourcePropertyDefinitionVersion", envelope.provenance().sourcePropertyDefinitionVersion(),
						"preservedAt", envelope.provenance().preservedAt().toString(),
						"sourceRecordVersion", envelope.provenance().sourceRecordVersion(),
						"reason", envelope.provenance().reason().wireName()))));
		try {
			return new ObjectMapper().writeValueAsBytes(wire).length;
		}
		catch (Exception exception) {
			throw new IllegalArgumentException("unmappedProperties 크기를 계산할 수 없습니다", exception);
		}
	}

	private static Map<String, Object> wirePropertyValue(PropertyValue value) {
		Object wireValue;
		if (value instanceof TextualPropertyValue textual) wireValue = textual.value();
		else if (value instanceof NumberPropertyValue number) wireValue = number.value().toPlainString();
		else if (value instanceof CheckboxPropertyValue checkbox) wireValue = checkbox.value();
		else if (value instanceof SelectPropertyValue select) wireValue = select.value();
		else if (value instanceof MultiSelectPropertyValue multiSelect) wireValue = multiSelect.value();
		else if (value instanceof DatePropertyValue date) {
			var dateValue = new LinkedHashMap<String, Object>();
			dateValue.put("precision", date.precision().name().toLowerCase(java.util.Locale.ROOT));
			dateValue.put("start", date.start());
			dateValue.put("end", date.end());
			if (date.precision() == DatePropertyValue.Precision.DATETIME) dateValue.put("timezone", date.timezone());
			wireValue = dateValue;
		}
		else if (value instanceof AssetPropertyValue asset) wireValue = asset.value();
		else throw new IllegalArgumentException("지원하지 않는 PropertyValue입니다");
		var result = new LinkedHashMap<String, Object>();
		result.put("propertyDefinitionId", value.propertyDefinitionId());
		result.put("type", value.type().wireName());
		result.put("value", wireValue);
		return result;
	}
}

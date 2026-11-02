package com.expresso.backend.career.application;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;



import com.expresso.backend.career.domain.AssetPropertyValue;
import com.expresso.backend.career.domain.CareerCategory;
import com.expresso.backend.career.domain.CareerRecord;
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


public final class CareerCategoryMovePlanner {

	public CareerCategoryMovePlan plan(
			CareerRecord record,
			CareerCategory source,
			CareerCategory target,
			Map<String, CareerUnmappedPropertyEnvelope> existingUnmapped,
			Instant now) {
		Objects.requireNonNull(record, "record는 null일 수 없습니다");
		Objects.requireNonNull(source, "source Category는 null일 수 없습니다");
		Objects.requireNonNull(target, "target Category는 null일 수 없습니다");
		Objects.requireNonNull(now, "이동 시각은 null일 수 없습니다");

		var sourceById = activeById(source);
		var targetDefinitions = active(target);
		var mapped = new ArrayList<PropertyValue>();
		var unmapped = new LinkedHashMap<>(existingUnmapped);
		var conversions = new ArrayList<CareerPropertyConversion>();

		for (var value : record.propertyValues()) {
			var sourceDefinition = sourceById.get(value.propertyDefinitionId());
			if (sourceDefinition == null) {
				throw new CareerRecordDataIntegrityException(
						new IllegalStateException("source Category에 PropertyValue Definition이 없습니다"));
			}
			var candidates = targetCandidates(sourceDefinition, targetDefinitions);
			if (candidates.size() != 1) {
				var reason = candidates.isEmpty()
						? CareerUnmappedPropertyReason.NO_TARGET_PROPERTY
						: CareerUnmappedPropertyReason.AMBIGUOUS_TARGET_PROPERTY;
				preserve(record, source, sourceDefinition, value, reason, now, unmapped, conversions);
				continue;
			}
			var targetDefinition = candidates.getFirst();
			var converted = convert(value, sourceDefinition, targetDefinition);
			if (converted.value() == null) {
				preserve(record, source, sourceDefinition, value, converted.reason(), now, unmapped, conversions);
				continue;
			}
			mapped.add(converted.value());
			unmapped.remove(sourceDefinition.id());
			conversions.add(new CareerPropertyConversion(
					sourceDefinition.id(), targetDefinition.id(), converted.kind(), value, converted.value()));
		}

		var computationIds = new java.util.TreeSet<String>();
		active(source).forEach(definition -> computationIds.add(definition.id()));
		targetDefinitions.forEach(definition -> computationIds.add(definition.id()));
		var targetVersions = new LinkedHashMap<String, Long>();
		targetDefinitions.stream().sorted(Comparator.comparing(PropertyDefinition::id))
				.forEach(definition -> targetVersions.put(definition.id(), definition.version()));
		return new CareerCategoryMovePlan(
				mapped,
				new CareerUnmappedProperties(unmapped),
				conversions,
				List.copyOf(computationIds),
				targetVersions);
	}

	private static void preserve(
			CareerRecord record,
			CareerCategory source,
			PropertyDefinition definition,
			PropertyValue value,
			CareerUnmappedPropertyReason reason,
			Instant now,
			Map<String, CareerUnmappedPropertyEnvelope> unmapped,
			List<CareerPropertyConversion> conversions) {
		unmapped.put(definition.id(), new CareerUnmappedPropertyEnvelope(
				source.id(),
				value,
				new CareerUnmappedPropertyProvenance(
						definition.key(), definition.name(), definition.version(), now, record.version(), reason)));
		conversions.add(new CareerPropertyConversion(
				definition.id(), null, CareerPropertyConversion.Kind.UNMAPPED, value, null));
	}

	private static Map<String, PropertyDefinition> activeById(CareerCategory category) {
		var result = new LinkedHashMap<String, PropertyDefinition>();
		active(category).forEach(definition -> result.put(definition.id(), definition));
		return result;
	}

	private static List<PropertyDefinition> active(CareerCategory category) {
		return category.propertyDefinitions().stream().filter(definition -> definition.deletedAt() == null).toList();
	}

	private static List<PropertyDefinition> targetCandidates(
			PropertyDefinition source,
			List<PropertyDefinition> targets) {
		var key = normalized(source.key());
		var byKey = targets.stream().filter(target -> normalized(target.key()).equals(key)).toList();
		if (!byKey.isEmpty()) return byKey;
		var name = normalized(source.name());
		return targets.stream().filter(target -> normalized(target.name()).equals(name)).toList();
	}

	private static String normalized(String value) {
		return value.trim().toLowerCase(Locale.KOREAN).replaceAll("\\s+", " ");
	}

	private static ConvertedValue convert(
			PropertyValue value,
			PropertyDefinition source,
			PropertyDefinition target) {
		if ((timestampType(source.type()) && source.system()) || (timestampType(target.type()) && target.system())) {
			return ConvertedValue.unmapped(CareerUnmappedPropertyReason.INCOMPATIBLE_TYPE);
		}
		if (timestampType(target.type())) {
			if (source.type() != PropertyDefinitionType.DATE && !timestampType(source.type())) return ConvertedValue.unmapped(CareerUnmappedPropertyReason.INCOMPATIBLE_TYPE);
			// 사용자 시각은 이미 존재하는 단일 datetime만 옮기며 offset·정밀도·timezone을 보존합니다.
			if (!(value instanceof DatePropertyValue date) || date.precision() != DatePropertyValue.Precision.DATETIME || date.end() != null) {
				return ConvertedValue.unmapped(CareerUnmappedPropertyReason.INCOMPATIBLE_TYPE);
			}
			return new ConvertedValue(rebind(date,target.id()),source.type() == target.type() ? CareerPropertyConversion.Kind.EXACT : CareerPropertyConversion.Kind.SAFE,null);
		}
		if (timestampType(source.type())) {
			if (!(value instanceof DatePropertyValue date) || date.precision() != DatePropertyValue.Precision.DATETIME || date.end() != null) {
				return ConvertedValue.unmapped(CareerUnmappedPropertyReason.INCOMPATIBLE_TYPE);
			}
			if (target.type() == PropertyDefinitionType.DATE) return new ConvertedValue(rebind(date,target.id()),CareerPropertyConversion.Kind.SAFE,null);
		}
		if (!target.type().writable()) {
			return ConvertedValue.unmapped(CareerUnmappedPropertyReason.INCOMPATIBLE_TYPE);
		}
		if ((value instanceof SelectPropertyValue || value instanceof MultiSelectPropertyValue)
				&& (target.type() == PropertyDefinitionType.SELECT || target.type() == PropertyDefinitionType.MULTI_SELECT)) {
			return convertOptions(value, source, target);
		}
		if (source.type() == target.type()) {
			return new ConvertedValue(rebind(value, target.id()), CareerPropertyConversion.Kind.EXACT, null);
		}
		if (value instanceof TextualPropertyValue textual && target.type() == PropertyDefinitionType.NUMBER) {
			try {
				return new ConvertedValue(new NumberPropertyValue(target.id(), new BigDecimal(textual.value())), CareerPropertyConversion.Kind.SAFE, null);
			}
			catch (IllegalArgumentException ignored) {
				return ConvertedValue.unmapped(CareerUnmappedPropertyReason.INCOMPATIBLE_TYPE);
			}
		}
		if (value instanceof CheckboxPropertyValue checkbox && target.type() == PropertyDefinitionType.NUMBER) {
			return new ConvertedValue(new NumberPropertyValue(target.id(), checkbox.value() ? BigDecimal.ONE : BigDecimal.ZERO), CareerPropertyConversion.Kind.SAFE, null);
		}
		if (value instanceof NumberPropertyValue number && target.type() == PropertyDefinitionType.CHECKBOX) {
			return new ConvertedValue(new CheckboxPropertyValue(target.id(), number.value().signum() != 0), CareerPropertyConversion.Kind.LOSSY, null);
		}
		if (isTextual(target.type())) {
			var text = textValue(value);
			if (text != null) {
				try {
					return new ConvertedValue(new TextualPropertyValue(target.id(), valueType(target.type()), text.value()), text.kind(), null);
				} catch (IllegalArgumentException ignored) {
					return ConvertedValue.unmapped(CareerUnmappedPropertyReason.INCOMPATIBLE_TYPE);
				}
			}
		}
		if (value instanceof AssetPropertyValue asset
				&& (target.type() == PropertyDefinitionType.FILE || target.type() == PropertyDefinitionType.MEDIA)) {
			return new ConvertedValue(new AssetPropertyValue(target.id(), valueType(target.type()), asset.value()), CareerPropertyConversion.Kind.SAFE, null);
		}
		return ConvertedValue.unmapped(CareerUnmappedPropertyReason.INCOMPATIBLE_TYPE);
	}

	private static ConvertedValue convertOptions(PropertyValue value, PropertyDefinition source, PropertyDefinition target) {
		var sourceNames = optionNames(source);
		var targetIds = optionIdsByExactName(target);
		var sourceIds = value instanceof SelectPropertyValue select
				? select.value() == null ? List.<String>of() : List.of(select.value())
				: ((MultiSelectPropertyValue) value).value();
		var mapped = new ArrayList<String>();
		for (var sourceId : sourceIds) {
			var name = sourceNames.get(sourceId);
			var ids = name == null ? List.<String>of() : targetIds.getOrDefault(name, List.of());
			if (ids.isEmpty()) return ConvertedValue.unmapped(CareerUnmappedPropertyReason.MISSING_TARGET_OPTION);
			if (ids.size() > 1) {
				throw new CareerRecordDataIntegrityException(
						new IllegalStateException("target Category에 같은 이름의 select option이 중복되어 있습니다"));
			}
			mapped.add(ids.getFirst());
		}
		if (target.type() == PropertyDefinitionType.SELECT) {
			var kind = mapped.size() <= 1 ? CareerPropertyConversion.Kind.SAFE : CareerPropertyConversion.Kind.LOSSY;
			return new ConvertedValue(new SelectPropertyValue(target.id(), mapped.isEmpty() ? null : mapped.getFirst()), kind, null);
		}
		return new ConvertedValue(new MultiSelectPropertyValue(target.id(), mapped), CareerPropertyConversion.Kind.SAFE, null);
	}

	private static Map<String, String> optionNames(PropertyDefinition definition) {
		var result = new LinkedHashMap<String, String>();
		for (var option : options(definition)) result.put((String) option.get("id"), (String) option.get("name"));
		return result;
	}

	private static Map<String, List<String>> optionIdsByExactName(PropertyDefinition definition) {
		var result = new LinkedHashMap<String, List<String>>();
		for (var option : options(definition)) {
			var name = (String) option.get("name");
			var ids = new ArrayList<>(result.getOrDefault(name, List.of()));
			ids.add((String) option.get("id"));
			result.put(name, List.copyOf(ids));
		}
		return result;
	}

	private static List<Map<String, Object>> options(PropertyDefinition definition) {
		var raw = definition.config().get("options");
		if (!(raw instanceof List<?> list)) {
			throw new CareerRecordDataIntegrityException(new IllegalStateException("select options는 배열이어야 합니다"));
		}
		var result = new ArrayList<Map<String, Object>>();
		var ids = new java.util.HashSet<String>();
		for (var item : list) {
			if (!(item instanceof Map<?, ?> map) || !(map.get("id") instanceof String id)) {
				throw new CareerRecordDataIntegrityException(new IllegalStateException("select option shape가 올바르지 않습니다"));
			}
			var name = map.get("name");
			var label = map.get("label");
			if ((map.containsKey("name") && !(name instanceof String))
					|| (map.containsKey("label") && !(label instanceof String))
					|| (name != null && label != null && !name.equals(label))
					|| (name == null && label == null)) {
				throw new CareerRecordDataIntegrityException(new IllegalStateException("select option 표시 이름이 올바르지 않습니다"));
			}
			try { PropertyValue.requireUuid(id, "optionId"); }
			catch (IllegalArgumentException error) { throw new CareerRecordDataIntegrityException(error); }
			if (!ids.add(id)) throw new CareerRecordDataIntegrityException(new IllegalStateException("select option ID가 중복되어 있습니다"));
			var option = new LinkedHashMap<String, Object>();
			for (var entry : map.entrySet()) {
				if (!(entry.getKey() instanceof String key)) {
					throw new CareerRecordDataIntegrityException(new IllegalStateException("select option key는 문자열이어야 합니다"));
				}
				option.put(key, entry.getValue());
			}
			// 기존 label 전용 데이터도 표시 원문을 바꾸지 않고 변환용 복사본에서 읽습니다.
			option.put("name", name != null ? name : label);
			result.add(option);
		}
		return result;
	}

	private static PropertyValue rebind(PropertyValue value, String targetId) {
		if (value instanceof TextualPropertyValue textual) return new TextualPropertyValue(targetId, textual.type(), textual.value());
		if (value instanceof NumberPropertyValue number) return new NumberPropertyValue(targetId, number.value());
		if (value instanceof CheckboxPropertyValue checkbox) return new CheckboxPropertyValue(targetId, checkbox.value());
		if (value instanceof DatePropertyValue date) return new DatePropertyValue(targetId, date.precision(), date.start(), date.end(), date.timezone());
		if (value instanceof AssetPropertyValue asset) return new AssetPropertyValue(targetId, asset.type(), asset.value());
		throw new IllegalArgumentException("지원하지 않는 PropertyValue 변환입니다");
	}

	private static TextConversion textValue(PropertyValue value) {
		if (value instanceof TextualPropertyValue textual) return new TextConversion(textual.value(), CareerPropertyConversion.Kind.SAFE);
		if (value instanceof NumberPropertyValue number) return new TextConversion(number.value().toPlainString(), CareerPropertyConversion.Kind.SAFE);
		if (value instanceof CheckboxPropertyValue checkbox) return new TextConversion(Boolean.toString(checkbox.value()), CareerPropertyConversion.Kind.SAFE);
		if (value instanceof DatePropertyValue date && date.end() == null) return new TextConversion(date.start(), CareerPropertyConversion.Kind.SAFE);
		if (value instanceof DatePropertyValue date) return new TextConversion(date.start() + " - " + date.end(), CareerPropertyConversion.Kind.LOSSY);
		return null;
	}

	private static boolean timestampType(PropertyDefinitionType type) {
		return type == PropertyDefinitionType.CREATED_TIME || type == PropertyDefinitionType.UPDATED_TIME;
	}

	private static boolean isTextual(PropertyDefinitionType type) {
		return type == PropertyDefinitionType.TEXT || type == PropertyDefinitionType.URL
				|| type == PropertyDefinitionType.EMAIL || type == PropertyDefinitionType.PHONE;
	}

	private static PropertyValueType valueType(PropertyDefinitionType type) {
		return PropertyValueType.valueOf(type.name());
	}

	private record ConvertedValue(
			PropertyValue value,
			CareerPropertyConversion.Kind kind,
			CareerUnmappedPropertyReason reason) {
		static ConvertedValue unmapped(CareerUnmappedPropertyReason reason) {
			return new ConvertedValue(null, CareerPropertyConversion.Kind.UNMAPPED, reason);
		}
	}

	private record TextConversion(String value, CareerPropertyConversion.Kind kind) {
	}
}

package com.expresso.backend.career.api;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;

import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.expresso.backend.career.application.CareerCategoryCreateService;
import com.expresso.backend.security.AuthenticatedUserPrincipal;

@RestController
@RequestMapping("/v1/career/categories")
public final class CareerCategoryCreateController {

	private static final Pattern CATEGORY_KEY = Pattern.compile("^[a-z][a-z0-9_]{1,63}$");
	private static final Pattern PROPERTY_KEY = Pattern.compile("^[A-Za-z][A-Za-z0-9_]{0,63}$");
	private static final Set<String> VIEWS = Set.of("table", "gallery", "timeline", "board", "list");
	private static final Set<String> TYPES = Set.of("text", "number", "date", "tags", "boolean");
	private final CareerCategoryCreateService service;

	public CareerCategoryCreateController(CareerCategoryCreateService service) {
		this.service = service;
	}

	@PostMapping
	public ResponseEntity<CareerPropertyDefinitionController.ApplyResponse> create(
			@AuthenticationPrincipal AuthenticatedUserPrincipal principal,
			@RequestBody Map<String, Object> body) {
		requireFields(body, Set.of("key", "name", "icon", "defaultView"), Set.of("propertySchema"));
		var key = string(body.get("key"), "key", 0, 0);
		if (!CATEGORY_KEY.matcher(key).matches()) {
			throw new CareerRecordRequestValidationException("key 형식이 올바르지 않습니다");
		}
		var name = string(body.get("name"), "name", 1, 120).trim();
		var icon = string(body.get("icon"), "icon", 1, 80).trim();
		var defaultView = string(body.get("defaultView"), "defaultView", 0, 0);
		if (!VIEWS.contains(defaultView)) {
			throw new CareerRecordRequestValidationException("defaultView가 올바르지 않습니다");
		}
		var propertySchema = body.containsKey("propertySchema")
				? propertySchema(body.get("propertySchema")) : Map.<String, Map<String, Object>>of();
		var category = service.create(
				principal.userId(), key, name, icon, defaultView, propertySchema);
		return ResponseEntity.status(201)
				.header(HttpHeaders.ETAG, "\"v" + category.version() + "\"")
				.body(CareerPropertyDefinitionController.ApplyResponse.from(category));
	}

	private static Map<String, Map<String, Object>> propertySchema(Object value) {
		if (!(value instanceof Map<?, ?> schema)) {
			throw new CareerRecordRequestValidationException("propertySchema는 객체여야 합니다");
		}
		var result = new LinkedHashMap<String, Map<String, Object>>();
		for (var entry : schema.entrySet()) {
			if (!(entry.getKey() instanceof String key) || !PROPERTY_KEY.matcher(key).matches()) {
				throw new CareerRecordRequestValidationException("propertySchema key 형식이 올바르지 않습니다");
			}
			if (!(entry.getValue() instanceof Map<?, ?> rawDefinition)) {
				throw new CareerRecordRequestValidationException("PropertyDefinition은 객체여야 합니다");
			}
			var definition = stringKeyMap(rawDefinition);
			requireFields(definition, Set.of("label", "type"), Set.of("id", "required", "system"));
			var normalized = new LinkedHashMap<String, Object>();
			if (definition.containsKey("id")) {
				normalized.put("id", uuid(string(definition.get("id"), "property.id", 0, 0), "property.id"));
			}
			normalized.put("label", string(definition.get("label"), "property.label", 1, 80).trim());
			var type = string(definition.get("type"), "property.type", 0, 0);
			if (!TYPES.contains(type)) {
				throw new CareerRecordRequestValidationException("지원하지 않는 property.type입니다");
			}
			normalized.put("type", type);
			normalized.put("required", booleanValue(definition.getOrDefault("required", false), "property.required"));
			normalized.put("system", booleanValue(definition.getOrDefault("system", false), "property.system"));
			result.put(key, java.util.Collections.unmodifiableMap(normalized));
		}
		return java.util.Collections.unmodifiableMap(result);
	}

	private static Map<String, Object> stringKeyMap(Map<?, ?> source) {
		var result = new LinkedHashMap<String, Object>();
		for (var entry : source.entrySet()) {
			if (!(entry.getKey() instanceof String key)) {
				throw new CareerRecordRequestValidationException("객체 key는 문자열이어야 합니다");
			}
			result.put(key, entry.getValue());
		}
		return result;
	}

	private static void requireFields(Map<String, ?> body, Set<String> required, Set<String> optional) {
		if (body == null || !body.keySet().containsAll(required)) {
			throw new CareerRecordRequestValidationException("요청 필드 구성이 올바르지 않습니다");
		}
		var allowed = new java.util.HashSet<>(required);
		allowed.addAll(optional);
		if (!allowed.containsAll(body.keySet())) {
			throw new CareerRecordRequestValidationException("요청 필드 구성이 올바르지 않습니다");
		}
	}

	private static String string(Object value, String field, int min, int max) {
		if (!(value instanceof String text)) {
			throw new CareerRecordRequestValidationException(field + "는 문자열이어야 합니다");
		}
		var trimmed = text.trim();
		if ((min > 0 && trimmed.length() < min) || (max > 0 && trimmed.length() > max)) {
			throw new CareerRecordRequestValidationException(field + " 길이가 올바르지 않습니다");
		}
		return text;
	}

	private static boolean booleanValue(Object value, String field) {
		if (value instanceof Boolean bool) return bool;
		throw new CareerRecordRequestValidationException(field + "는 boolean이어야 합니다");
	}

	private static String uuid(String value, String field) {
		try {
			return UUID.fromString(value).toString();
		}
		catch (IllegalArgumentException exception) {
			throw new CareerRecordRequestValidationException(field + "는 UUID여야 합니다");
		}
	}
}

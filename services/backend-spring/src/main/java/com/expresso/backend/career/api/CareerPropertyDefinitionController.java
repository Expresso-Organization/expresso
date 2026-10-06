package com.expresso.backend.career.api;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;

import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.expresso.backend.career.application.CareerPropertyCategorySnapshot;
import com.expresso.backend.career.application.CareerPropertyChangeImpact;
import com.expresso.backend.career.application.CareerPropertyCreateChange;
import com.expresso.backend.career.application.CareerPropertyCreatePreview;
import com.expresso.backend.career.application.CareerPropertyDefinitionCreateService;
import com.expresso.backend.career.application.CareerPropertyDefinitionV2Snapshot;
import com.expresso.backend.career.application.CareerPropertyRenameChange;
import com.expresso.backend.career.application.CareerPropertyReorderChange;
import com.expresso.backend.career.application.CareerPropertySchemaChange;
import com.expresso.backend.career.domain.PropertyDefinitionType;
import com.expresso.backend.security.AuthenticatedUserPrincipal;

@RestController
@RequestMapping("/v1/career/categories/{categoryId}/property-schema")
public final class CareerPropertyDefinitionController {

	private static final Pattern IDEMPOTENCY_KEY =
			Pattern.compile("^[A-Za-z0-9._~:+\\-/]{16,128}$");
	private final CareerPropertyDefinitionCreateService service;

	public CareerPropertyDefinitionController(CareerPropertyDefinitionCreateService service) {
		this.service = service;
	}

	@PostMapping("/preview")
	public PreviewResponse preview(
			@PathVariable String categoryId,
			@AuthenticationPrincipal AuthenticatedUserPrincipal principal,
			@RequestBody Map<String, Object> body) {
		var change = change(body);
		return PreviewResponse.from(service.preview(
				principal.userId(), uuid(categoryId, "categoryId"), change));
	}

	@PostMapping("/apply")
	public ResponseEntity<ApplyResponse> apply(
			@PathVariable String categoryId,
			@AuthenticationPrincipal AuthenticatedUserPrincipal principal,
			@RequestHeader(HttpHeaders.IF_MATCH) String ifMatch,
			@RequestHeader("Idempotency-Key") String idempotencyKey,
			@RequestBody Map<String, Object> body) {
		requireExactFields(body, Set.of("change", "previewToken", "confirmLossy"));
		var confirmLossy = body.get("confirmLossy");
		if (!(confirmLossy instanceof Boolean value) || value) {
			throw new CareerRecordRequestValidationException("Property schema apply의 confirmLossy는 false여야 합니다");
		}
		var previewToken = string(body.get("previewToken"), "previewToken");
		if (previewToken.length() < 32 || previewToken.length() > 4096) {
			throw new CareerRecordRequestValidationException("previewToken 길이가 올바르지 않습니다");
		}
		if (idempotencyKey == null || !IDEMPOTENCY_KEY.matcher(idempotencyKey).matches()) {
			throw new CareerRecordRequestValidationException("Idempotency-Key 형식이 올바르지 않습니다");
		}
		var category = service.apply(
				principal.userId(),
				uuid(categoryId, "categoryId"),
				CareerRecordController.parseExpectedVersion(ifMatch),
				idempotencyKey,
				change(body.get("change")),
				previewToken);
		return ResponseEntity.ok()
				.eTag("\"v" + category.version() + "\"")
				.body(ApplyResponse.from(category));
	}

	private static CareerPropertySchemaChange change(Object value) {
		var change = object(value, "change");
		if ("create".equals(change.get("kind"))) {
			return createChange(change);
		}
		if ("rename".equals(change.get("kind"))) {
			requireExactFields(change, Set.of("kind", "propertyId", "name"));
			return new CareerPropertyRenameChange(
					uuid(string(change.get("propertyId"), "propertyId"), "propertyId"),
					string(change.get("name"), "name"));
		}
		if ("reorder".equals(change.get("kind"))) {
			requireExactFields(change, Set.of("kind", "propertyId", "order"));
			return new CareerPropertyReorderChange(
					uuid(string(change.get("propertyId"), "propertyId"), "propertyId"),
					nonNegativeInt(change.get("order"), "order"));
		}
		throw new CareerRecordRequestValidationException("지원하지 않는 Property schema 변경입니다");
	}

	private static CareerPropertyCreateChange createChange(Map<String, Object> change) {
		requireExactFields(change, Set.of("kind", "property"));
		var property = object(change.get("property"), "property");
		requireRequiredAndOptionalFields(
				property,
				Set.of("key", "name", "type", "required", "system", "config"),
				Set.of("id", "order"));
		if (!Boolean.FALSE.equals(property.get("required"))) {
			throw new CareerRecordRequestValidationException("첫 Spring Property 생성은 required=false만 지원합니다");
		}
		if (!Boolean.FALSE.equals(property.get("system"))) {
			throw new CareerRecordRequestValidationException("사용자 Property는 system=false여야 합니다");
		}
		var type = propertyType(string(property.get("type"), "property.type"));
		var id = property.containsKey("id") ? uuid(string(property.get("id"), "property.id"), "property.id") : null;
		var order = property.containsKey("order") ? nonNegativeInt(property.get("order"), "property.order") : null;
		return new CareerPropertyCreateChange(
				id,
				string(property.get("key"), "property.key"),
				string(property.get("name"), "property.name"),
				type,
				object(property.get("config"), "property.config"),
				order);
	}

	private static PropertyDefinitionType propertyType(String value) {
		try {
			return PropertyDefinitionType.valueOf(value.toUpperCase(java.util.Locale.ROOT));
		}
		catch (IllegalArgumentException exception) {
			throw new CareerRecordRequestValidationException("지원하지 않는 property.type입니다");
		}
	}

	private static void requireExactFields(Map<String, Object> body, Set<String> fields) {
		if (body == null || !body.keySet().equals(fields)) {
			throw new CareerRecordRequestValidationException("요청 필드 구성이 올바르지 않습니다");
		}
	}

	private static void requireRequiredAndOptionalFields(
			Map<String, Object> body, Set<String> required, Set<String> optional) {
		if (body == null || !body.keySet().containsAll(required)) {
			throw new CareerRecordRequestValidationException("요청 필드 구성이 올바르지 않습니다");
		}
		var allowed = new java.util.HashSet<>(required);
		allowed.addAll(optional);
		if (!allowed.containsAll(body.keySet())) {
			throw new CareerRecordRequestValidationException("요청 필드 구성이 올바르지 않습니다");
		}
	}

	private static Map<String, Object> object(Object value, String field) {
		if (!(value instanceof Map<?, ?> map)) {
			throw new CareerRecordRequestValidationException(field + "는 객체여야 합니다");
		}
		var copy = new LinkedHashMap<String, Object>();
		for (var entry : map.entrySet()) {
			if (!(entry.getKey() instanceof String key)) {
				throw new CareerRecordRequestValidationException(field + "의 key는 문자열이어야 합니다");
			}
			copy.put(key, jsonValue(entry.getValue(), field));
		}
		return copy;
	}

	private static Object jsonValue(Object value, String field) {
		if (value == null || value instanceof String || value instanceof Boolean || value instanceof Number) {
			return value;
		}
		if (value instanceof List<?> list) {
			var copy = new ArrayList<>(list.size());
			for (var item : list) copy.add(jsonValue(item, field));
			return List.copyOf(copy);
		}
		if (value instanceof Map<?, ?>) return object(value, field);
		throw new CareerRecordRequestValidationException(field + "에 지원하지 않는 JSON 값이 있습니다");
	}

	private static String uuid(String value, String field) {
		try {
			return UUID.fromString(value).toString();
		}
		catch (IllegalArgumentException exception) {
			throw new CareerRecordRequestValidationException(field + "는 UUID여야 합니다");
		}
	}

	private static String string(Object value, String field) {
		if (!(value instanceof String text)) {
			throw new CareerRecordRequestValidationException(field + "는 문자열이어야 합니다");
		}
		return text;
	}

	private static int nonNegativeInt(Object value, String field) {
		if (!(value instanceof Number number)
				|| number.intValue() < 0 || number.doubleValue() != number.intValue()) {
			throw new CareerRecordRequestValidationException(field + "는 0 이상의 정수여야 합니다");
		}
		return number.intValue();
	}

	public record PreviewResponse(PreviewData data) {
		static PreviewResponse from(CareerPropertyCreatePreview preview) {
			return new PreviewResponse(new PreviewData(
					preview.categoryId(), preview.categoryVersion(),
					changeResponse(preview.change()),
					ImpactResponse.from(preview.impact()),
					preview.previewToken()));
		}
	}

	public record PreviewData(
			String categoryId,
			long categoryVersion,
			Map<String, Object> change,
			ImpactResponse impact,
			String previewToken) {
	}

	public record ImpactResponse(
			long affectedRecordCount,
			long convertibleCount,
			List<Object> lossyExamples,
			List<String> dependentViews,
			List<String> dependentFormulas,
			List<String> dependentRollups) {
		static ImpactResponse from(CareerPropertyChangeImpact impact) {
			return new ImpactResponse(
					impact.affectedRecordCount(), impact.convertibleCount(), List.of(),
					impact.dependentViews(), impact.dependentFormulas(), impact.dependentRollups());
		}
	}

	private static Map<String, Object> changeResponse(CareerPropertySchemaChange change) {
		if (change instanceof CareerPropertyRenameChange rename) {
			return Map.of("kind", "rename", "propertyId", rename.propertyId(), "name", rename.name());
		}
		if (change instanceof CareerPropertyReorderChange reorder) {
			return Map.of("kind", "reorder", "propertyId", reorder.propertyId(), "order", reorder.order());
		}
		var create = (CareerPropertyCreateChange) change;
			var property = new LinkedHashMap<String, Object>();
			if (create.id() != null) property.put("id", create.id());
			property.put("key", create.key());
			property.put("name", create.name());
			property.put("type", create.type().wireName());
			property.put("required", false);
			property.put("system", false);
			property.put("config", create.config());
			if (create.order() != null) property.put("order", create.order());
			return Map.of("kind", "create", "property", java.util.Collections.unmodifiableMap(property));
	}

	public record ApplyResponse(CategoryResponse data) {
		static ApplyResponse from(CareerPropertyCategorySnapshot category) {
			return new ApplyResponse(CategoryResponse.from(category));
		}
	}

	public record CategoryResponse(
			String id,
			String key,
			String name,
			String icon,
			String defaultView,
			boolean isSystem,
			Map<String, Object> propertySchema,
			List<PropertyDefinitionV2Response> propertySchemaV2,
			long schemaVersion,
			int sortOrder,
			int recordCount,
			long version) {
		static CategoryResponse from(CareerPropertyCategorySnapshot category) {
			return new CategoryResponse(
					category.id(), category.key(), category.name(), category.icon(), category.defaultView(),
					category.system(), category.propertySchema(),
					category.propertySchemaV2().stream().map(PropertyDefinitionV2Response::from).toList(),
					category.schemaVersion(), category.sortOrder(), 0, category.version());
		}
	}

	public record PropertyDefinitionV2Response(
			String id,
			String key,
			String name,
			String type,
			boolean required,
			boolean system,
			Map<String, Object> config,
			int order,
			long version,
			Instant deletedAt) {
		static PropertyDefinitionV2Response from(CareerPropertyDefinitionV2Snapshot definition) {
			return new PropertyDefinitionV2Response(
					definition.id(), definition.key(), definition.name(), definition.type(),
					definition.required(), definition.system(), definition.config(),
					definition.order(), definition.version(), definition.deletedAt());
		}
	}
}

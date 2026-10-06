package com.expresso.backend.career.api;

import java.util.List;
import java.util.Map;
import java.util.Set;

import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.expresso.backend.career.application.CareerCategoryMovePreview;
import com.expresso.backend.career.application.CareerCategoryMoveService;
import com.expresso.backend.career.application.CareerPropertyConversion;
import com.expresso.backend.career.application.CareerUnmappedPropertyEnvelope;
import com.expresso.backend.career.application.CommitCareerCategoryMoveCommand;
import com.expresso.backend.security.AuthenticatedUserPrincipal;

@RestController
@RequestMapping("/v1/career/records/{recordId}/move")
public final class CareerCategoryMoveController {

	private final CareerCategoryMoveService service;

	public CareerCategoryMoveController(CareerCategoryMoveService service) {
		this.service = service;
	}

	@PostMapping("/preview")
	public PreviewResponse preview(
			@PathVariable String recordId,
			@AuthenticationPrincipal AuthenticatedUserPrincipal principal,
			@RequestBody Map<String, Object> body) {
		requireFields(body, Set.of("targetCategoryId"));
		var targetCategoryId = uuid(body.get("targetCategoryId"), "targetCategoryId");
		return new PreviewResponse(PreviewData.from(service.preview(
				principal.userId(), CareerRecordController.normalizeUuid(recordId, "recordId"), targetCategoryId)));
	}

	@PostMapping
	public ResponseEntity<CareerRecordController.CareerRecordResponse> commit(
			@PathVariable String recordId,
			@AuthenticationPrincipal AuthenticatedUserPrincipal principal,
			@RequestHeader(HttpHeaders.IF_MATCH) String ifMatch,
			@RequestBody Map<String, Object> body) {
		requireRequiredAndOptionalFields(
				body, Set.of("targetCategoryId", "previewToken", "expectedVersion"), Set.of("discardUnmappedPropertyIds"));
		var targetCategoryId = uuid(body.get("targetCategoryId"), "targetCategoryId");
		var token = string(body.get("previewToken"), "previewToken");
		var expectedVersion = positiveLong(body.get("expectedVersion"), "expectedVersion");
		var discard = body.containsKey("discardUnmappedPropertyIds")
				? uuidList(body.get("discardUnmappedPropertyIds"), "discardUnmappedPropertyIds") : List.<String>of();
		var moved = service.commit(principal.userId(), CareerRecordController.normalizeUuid(recordId, "recordId"),
				CareerRecordController.parseExpectedVersion(ifMatch),
				new CommitCareerCategoryMoveCommand(targetCategoryId, token, expectedVersion, discard));
		return CareerRecordController.recordResponse(moved, HttpStatus.OK);
	}

	private static void requireFields(Map<String, Object> body, Set<String> fields) {
		if (body == null || !body.keySet().equals(fields)) throw new CareerRecordRequestValidationException("요청 필드 구성이 올바르지 않습니다");
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

	private static String uuid(Object value, String field) {
		return CareerRecordController.normalizeUuid(string(value, field), field);
	}

	private static String string(Object value, String field) {
		if (!(value instanceof String text)) throw new CareerRecordRequestValidationException(field + "는 문자열이어야 합니다");
		return text;
	}

	private static long positiveLong(Object value, String field) {
		if (!(value instanceof Number number) || number.longValue() < 1 || number.doubleValue() != number.longValue()) {
			throw new CareerRecordRequestValidationException(field + "는 양의 정수여야 합니다");
		}
		return number.longValue();
	}

	private static List<String> uuidList(Object value, String field) {
		if (!(value instanceof List<?> list) || list.size() > 200) throw new CareerRecordRequestValidationException(field + "는 최대 200개의 UUID 배열이어야 합니다");
		return list.stream().map(item -> uuid(item, field + " 항목")).toList();
	}

	public record PreviewResponse(PreviewData data) { }

	public record PreviewData(
			String recordId, String sourceCategoryId, String targetCategoryId,
			long recordVersion, long sourceSchemaVersion, long targetSchemaVersion,
			List<ConversionData> conversions,
			Map<String, UnmappedData> unmappedProperties,
			String previewToken) {
		static PreviewData from(CareerCategoryMovePreview preview) {
			return new PreviewData(preview.recordId(), preview.sourceCategoryId(), preview.targetCategoryId(),
					preview.recordVersion(), preview.sourceSchemaVersion(), preview.targetSchemaVersion(),
					preview.conversions().stream().map(ConversionData::from).toList(),
					preview.unmappedProperties().entrySet().stream().collect(java.util.stream.Collectors.toMap(
							Map.Entry::getKey, entry -> UnmappedData.from(entry.getValue()), (left, right) -> left, java.util.LinkedHashMap::new)),
					preview.previewToken());
		}
	}

	public record ConversionData(String sourcePropertyId, String targetPropertyId, String kind,
			CareerRecordController.PropertyValueResponse sampleBefore,
			CareerRecordController.PropertyValueResponse sampleAfter) {
		static ConversionData from(CareerPropertyConversion value) {
			return new ConversionData(value.sourcePropertyId(), value.targetPropertyId(), value.kind().name().toLowerCase(java.util.Locale.ROOT),
					value.sampleBefore() == null ? null : CareerRecordController.PropertyValueResponse.from(value.sampleBefore()),
					value.sampleAfter() == null ? null : CareerRecordController.PropertyValueResponse.from(value.sampleAfter()));
		}
	}

	public record UnmappedData(String sourceCategoryId, CareerRecordController.PropertyValueResponse propertyValue,
			ProvenanceData provenance) {
		static UnmappedData from(CareerUnmappedPropertyEnvelope value) {
			return new UnmappedData(value.sourceCategoryId(), CareerRecordController.PropertyValueResponse.from(value.propertyValue()),
					new ProvenanceData(value.provenance().sourcePropertyKey(), value.provenance().sourcePropertyName(),
							value.provenance().sourcePropertyDefinitionVersion(), value.provenance().preservedAt(),
							value.provenance().sourceRecordVersion(), value.provenance().reason().wireName()));
		}
	}

	public record ProvenanceData(String sourcePropertyKey, String sourcePropertyName,
			long sourcePropertyDefinitionVersion, java.time.Instant preservedAt,
			long sourceRecordVersion, String reason) { }
}

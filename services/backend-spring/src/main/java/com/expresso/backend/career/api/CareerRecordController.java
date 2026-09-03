package com.expresso.backend.career.api;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;

import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.expresso.backend.career.application.CreateCareerRecordUseCase;
import com.expresso.backend.career.application.GetCareerRecordUseCase;
import com.expresso.backend.career.application.PatchCareerRecordUseCase;
import com.expresso.backend.career.domain.BlockBody;
import com.expresso.backend.career.domain.CareerRecord;
import com.expresso.backend.career.domain.CareerRecordChangeSet;
import com.expresso.backend.career.domain.ParagraphBlock;
import com.expresso.backend.career.domain.TextPropertyValue;
import com.expresso.backend.career.domain.TextSpan;
import com.expresso.backend.security.AuthenticatedUserPrincipal;

@RestController
@RequestMapping("/v1/career/records")
public class CareerRecordController {

	private static final Pattern IDEMPOTENCY_KEY_PATTERN = Pattern.compile("^[A-Za-z0-9._~:+\\-/]{16,128}$");
	private static final Pattern ETAG_PATTERN = Pattern.compile("^\"v([1-9][0-9]*)\"$");

	private final CreateCareerRecordUseCase createCareerRecord;
	private final GetCareerRecordUseCase getCareerRecord;
	private final PatchCareerRecordUseCase patchCareerRecord;

	public CareerRecordController(
			CreateCareerRecordUseCase createCareerRecord,
			GetCareerRecordUseCase getCareerRecord,
			PatchCareerRecordUseCase patchCareerRecord) {
		this.createCareerRecord = createCareerRecord;
		this.getCareerRecord = getCareerRecord;
		this.patchCareerRecord = patchCareerRecord;
	}

	@PostMapping
	public ResponseEntity<CareerRecordResponse> create(
			@AuthenticationPrincipal AuthenticatedUserPrincipal principal,
			@RequestHeader(name = "Idempotency-Key", required = false) String idempotencyKey,
			@RequestBody Map<String, Object> body) {
		validateIdempotencyKey(idempotencyKey);
		var categoryId = readCategoryId(body);
		var result = createCareerRecord.create(principal.userId(), categoryId, idempotencyKey);
		return recordResponse(result.record(), result.created() ? HttpStatus.CREATED : HttpStatus.OK);
	}

	@GetMapping("/{recordId}")
	public ResponseEntity<CareerRecordResponse> get(
			@AuthenticationPrincipal AuthenticatedUserPrincipal principal,
			@PathVariable String recordId) {
		var normalizedRecordId = normalizeUuid(recordId, "recordId");
		var record = getCareerRecord.get(principal.userId(), normalizedRecordId);
		return recordResponse(record, HttpStatus.OK);
	}

	@PatchMapping("/{recordId}")
	public ResponseEntity<CareerRecordResponse> patch(
			@AuthenticationPrincipal AuthenticatedUserPrincipal principal,
			@PathVariable String recordId,
			@RequestHeader(name = HttpHeaders.IF_MATCH, required = false) String ifMatch,
			@RequestBody Map<String, Object> body) {
		var normalizedRecordId = normalizeUuid(recordId, "recordId");
		var expectedVersion = parseExpectedVersion(ifMatch);
		var changeSet = readChangeSet(body);
		var record = patchCareerRecord.patch(principal.userId(), normalizedRecordId, expectedVersion, changeSet);
		return recordResponse(record, HttpStatus.OK);
	}

	private static void validateIdempotencyKey(String idempotencyKey) {
		if (idempotencyKey == null || !IDEMPOTENCY_KEY_PATTERN.matcher(idempotencyKey).matches()) {
			throw new CareerRecordRequestValidationException(
					"Idempotency-Key는 16~128자의 허용된 문자로 구성해야 합니다");
		}
	}

	private static String readCategoryId(Map<String, Object> body) {
		if (body == null || !body.keySet().equals(java.util.Set.of("categoryId"))) {
			throw new CareerRecordRequestValidationException("요청 본문에는 categoryId만 있어야 합니다");
		}
		if (!(body.get("categoryId") instanceof String categoryId)) {
			throw new CareerRecordRequestValidationException("categoryId는 UUID 문자열이어야 합니다");
		}
		return normalizeUuid(categoryId, "categoryId");
	}

	private static String normalizeUuid(String value, String fieldName) {
		try {
			var parsedValue = UUID.fromString(value);
			if (!parsedValue.toString().equalsIgnoreCase(value)) {
				throw new CareerRecordRequestValidationException(fieldName + "는 올바른 UUID여야 합니다");
			}
			return parsedValue.toString();
		}
		catch (IllegalArgumentException error) {
			throw new CareerRecordRequestValidationException(fieldName + "는 올바른 UUID여야 합니다");
		}
	}

	private static long parseExpectedVersion(String ifMatch) {
		if (ifMatch == null) {
			throw new CareerRecordRequestValidationException("If-Match header가 필요합니다");
		}
		var matcher = ETAG_PATTERN.matcher(ifMatch);
		if (!matcher.matches()) {
			throw new CareerRecordRequestValidationException("If-Match는 \"vN\" 형식이어야 합니다");
		}
		try {
			return Long.parseLong(matcher.group(1));
		}
		catch (NumberFormatException error) {
			throw new CareerRecordRequestValidationException("If-Match version이 너무 큽니다");
		}
	}

	private static CareerRecordChangeSet readChangeSet(Map<String, Object> body) {
		var allowedFields = Set.of("title", "propertyValues", "blockBody");
		if (body == null || body.isEmpty() || !allowedFields.containsAll(body.keySet())) {
			throw new CareerRecordRequestValidationException("요청 본문에는 수정할 canonical 필드가 필요합니다");
		}
		var changeSet = CareerRecordChangeSet.none();
		try {
			if (body.containsKey("title")) {
				if (!(body.get("title") instanceof String title)) {
					throw new CareerRecordRequestValidationException("title은 문자열이어야 합니다");
				}
				changeSet = changeSet.withTitle(title);
			}
			if (body.containsKey("propertyValues")) {
				changeSet = changeSet.withPropertyValues(readPropertyValues(body.get("propertyValues")));
			}
			if (body.containsKey("blockBody")) {
				changeSet = changeSet.withBlockBody(readBlockBody(body.get("blockBody")));
			}
			return changeSet;
		}
		catch (IllegalArgumentException validationError) {
			throw new CareerRecordRequestValidationException("요청 본문의 canonical 값이 올바르지 않습니다");
		}
	}

	private static List<TextPropertyValue> readPropertyValues(Object value) {
		if (!(value instanceof List<?> values)) {
			throw new CareerRecordRequestValidationException("propertyValues는 배열이어야 합니다");
		}
		return values.stream().map(CareerRecordController::readPropertyValue).toList();
	}

	private static TextPropertyValue readPropertyValue(Object value) {
		var propertyValue = requireMap(value, "propertyValues 항목");
		requireExactFields(propertyValue, Set.of("propertyDefinitionId", "type", "value"),
				"propertyValues 항목");
		var propertyDefinitionId = normalizeUuid(
				requireString(propertyValue, "propertyDefinitionId"),
				"propertyDefinitionId");
		if (!"text".equals(requireString(propertyValue, "type"))) {
			throw new CareerRecordRequestValidationException("PropertyValue type은 text여야 합니다");
		}
		return new TextPropertyValue(propertyDefinitionId, requireString(propertyValue, "value"));
	}

	private static BlockBody readBlockBody(Object value) {
		var blockBody = requireMap(value, "blockBody");
		requireExactFields(blockBody, Set.of("schemaVersion", "type", "content"), "blockBody");
		if (!(blockBody.get("schemaVersion") instanceof Integer schemaVersion) || schemaVersion != 1) {
			throw new CareerRecordRequestValidationException("blockBody schemaVersion은 1이어야 합니다");
		}
		if (!"doc".equals(requireString(blockBody, "type"))) {
			throw new CareerRecordRequestValidationException("blockBody type은 doc이어야 합니다");
		}
		if (!(blockBody.get("content") instanceof List<?> content)) {
			throw new CareerRecordRequestValidationException("blockBody content는 배열이어야 합니다");
		}
		return new BlockBody(content.stream().map(CareerRecordController::readParagraph).toList());
	}

	private static ParagraphBlock readParagraph(Object value) {
		var paragraph = requireMap(value, "paragraph");
		requireExactFields(paragraph, Set.of("id", "type", "attrs", "text"), "paragraph");
		var id = normalizeUuid(requireString(paragraph, "id"), "paragraph id");
		if (!"paragraph".equals(requireString(paragraph, "type"))) {
			throw new CareerRecordRequestValidationException("block type은 paragraph여야 합니다");
		}
		var attrs = requireMap(paragraph.get("attrs"), "paragraph attrs");
		if (!attrs.isEmpty()) {
			throw new CareerRecordRequestValidationException("paragraph attrs는 빈 객체여야 합니다");
		}
		if (!(paragraph.get("text") instanceof List<?> text)) {
			throw new CareerRecordRequestValidationException("paragraph text는 배열이어야 합니다");
		}
		return new ParagraphBlock(id, text.stream().map(CareerRecordController::readTextSpan).toList());
	}

	private static TextSpan readTextSpan(Object value) {
		var span = requireMap(value, "text span");
		requireExactFields(span, Set.of("text"), "text span");
		return new TextSpan(requireString(span, "text"));
	}

	private static Map<?, ?> requireMap(Object value, String fieldName) {
		if (!(value instanceof Map<?, ?> map)) {
			throw new CareerRecordRequestValidationException(fieldName + "는 객체여야 합니다");
		}
		return map;
	}

	private static void requireExactFields(Map<?, ?> value, Set<String> fields, String fieldName) {
		if (!value.keySet().equals(fields)) {
			throw new CareerRecordRequestValidationException(fieldName + " 필드 구성이 올바르지 않습니다");
		}
	}

	private static String requireString(Map<?, ?> value, String fieldName) {
		if (!(value.get(fieldName) instanceof String stringValue)) {
			throw new CareerRecordRequestValidationException(fieldName + "는 문자열이어야 합니다");
		}
		return stringValue;
	}

	private static ResponseEntity<CareerRecordResponse> recordResponse(CareerRecord record, HttpStatus status) {
		var response = new CareerRecordResponse(CareerRecordData.from(record));
		return ResponseEntity.status(status)
				.header(HttpHeaders.ETAG, "\"v" + record.version() + "\"")
				.body(response);
	}

	public record CareerRecordResponse(CareerRecordData data) {
	}

	public record CareerRecordData(
			String id,
			String categoryId,
			String title,
			List<TextPropertyValueResponse> propertyValues,
			BlockBodyResponse blockBody,
			long version,
			Instant updatedAt) {

		private static CareerRecordData from(CareerRecord record) {
			return new CareerRecordData(
					record.id(),
					record.categoryId(),
					record.title(),
					record.propertyValues().stream().map(TextPropertyValueResponse::from).toList(),
					BlockBodyResponse.from(record.blockBody()),
					record.version(),
					record.updatedAt());
		}
	}

	public record TextPropertyValueResponse(String propertyDefinitionId, String type, String value) {

		private static TextPropertyValueResponse from(TextPropertyValue propertyValue) {
			return new TextPropertyValueResponse(propertyValue.propertyDefinitionId(), "text", propertyValue.value());
		}
	}

	public record BlockBodyResponse(int schemaVersion, String type, List<ParagraphBlockResponse> content) {

		private static BlockBodyResponse from(BlockBody blockBody) {
			return new BlockBodyResponse(
					1,
					"doc",
					blockBody.paragraphs().stream().map(ParagraphBlockResponse::from).toList());
		}
	}

	public record ParagraphBlockResponse(
			String id,
			String type,
			Map<String, Object> attrs,
			List<TextSpanResponse> text) {

		private static ParagraphBlockResponse from(ParagraphBlock paragraph) {
			return new ParagraphBlockResponse(
					paragraph.id(),
					"paragraph",
					Map.of(),
					paragraph.text().stream().map(span -> new TextSpanResponse(span.text())).toList());
		}
	}

	public record TextSpanResponse(String text) {
	}

}

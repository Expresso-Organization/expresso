package com.expresso.backend.career.api;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Pattern;

import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.expresso.backend.career.application.CreateCareerRecordUseCase;
import com.expresso.backend.career.domain.BlockBody;
import com.expresso.backend.career.domain.CareerRecord;
import com.expresso.backend.career.domain.ParagraphBlock;
import com.expresso.backend.career.domain.TextPropertyValue;
import com.expresso.backend.security.AuthenticatedUserPrincipal;

@RestController
@RequestMapping("/v1/career/records")
public class CareerRecordController {

	private static final Pattern IDEMPOTENCY_KEY_PATTERN = Pattern.compile("^[A-Za-z0-9._~:+\\-/]{16,128}$");

	private final CreateCareerRecordUseCase createCareerRecord;

	public CareerRecordController(CreateCareerRecordUseCase createCareerRecord) {
		this.createCareerRecord = createCareerRecord;
	}

	@PostMapping
	public ResponseEntity<CareerRecordResponse> create(
			@AuthenticationPrincipal AuthenticatedUserPrincipal principal,
			@RequestHeader(name = "Idempotency-Key", required = false) String idempotencyKey,
			@RequestBody Map<String, Object> body) {
		validateIdempotencyKey(idempotencyKey);
		var categoryId = readCategoryId(body);
		var result = createCareerRecord.create(principal.userId(), categoryId, idempotencyKey);
		var response = new CareerRecordResponse(CareerRecordData.from(result.record()));
		return ResponseEntity.status(result.created() ? 201 : 200)
				.header(HttpHeaders.ETAG, "\"v" + result.record().version() + "\"")
				.body(response);
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
		try {
			var parsedCategoryId = UUID.fromString(categoryId);
			if (!parsedCategoryId.toString().equalsIgnoreCase(categoryId)) {
				throw new CareerRecordRequestValidationException("categoryId는 올바른 UUID여야 합니다");
			}
			return parsedCategoryId.toString();
		}
		catch (IllegalArgumentException error) {
			throw new CareerRecordRequestValidationException("categoryId는 올바른 UUID여야 합니다");
		}
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

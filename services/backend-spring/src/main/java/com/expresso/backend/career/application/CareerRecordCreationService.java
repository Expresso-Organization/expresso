package com.expresso.backend.career.application;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.temporal.ChronoUnit;
import java.util.HexFormat;
import java.util.Objects;
import java.util.UUID;

import org.springframework.stereotype.Service;

import com.expresso.backend.career.domain.CareerRecord;

@Service
public class CareerRecordCreationService implements CreateCareerRecordUseCase {

	private final CareerCategoryRepository categoryRepository;
	private final CareerRecordRepository recordRepository;
	private final Clock clock;

	public CareerRecordCreationService(
			CareerCategoryRepository categoryRepository,
			CareerRecordRepository recordRepository,
			Clock clock) {
		this.categoryRepository = Objects.requireNonNull(categoryRepository, "categoryRepository는 null일 수 없습니다");
		this.recordRepository = Objects.requireNonNull(recordRepository, "recordRepository는 null일 수 없습니다");
		this.clock = Objects.requireNonNull(clock, "clock은 null일 수 없습니다");
	}

	@Override
	public CreateCareerRecordResult create(String ownerId, String categoryId, String idempotencyKey) {
		Objects.requireNonNull(ownerId, "ownerId는 null일 수 없습니다");
		Objects.requireNonNull(categoryId, "categoryId는 null일 수 없습니다");
		Objects.requireNonNull(idempotencyKey, "idempotencyKey는 null일 수 없습니다");
		if (!categoryRepository.existsSystemCategory(categoryId)) {
			throw new CareerRecordCategoryNotAllowedException();
		}

		var newRecord = CareerRecord.create(
				UUID.randomUUID().toString(),
				ownerId,
				categoryId,
				UUID.randomUUID().toString(),
				clock.instant().truncatedTo(ChronoUnit.MILLIS));
		var result = recordRepository.createOrReplay(newRecord, idempotencyKey, requestHash(categoryId));
		return new CreateCareerRecordResult(result.record(), result.created());
	}

	private static String requestHash(String categoryId) {
		// Fastify가 같은 빈 생성 요청에 기본값을 적용한 뒤 만드는 안정 정렬 JSON과 같습니다.
		var canonicalRequest = "{\"bodyMd\":\"\",\"categoryId\":\"" + categoryId
				+ "\",\"properties\":{},\"title\":\"\"}";
		try {
			var digest = MessageDigest.getInstance("SHA-256");
			return HexFormat.of().formatHex(digest.digest(canonicalRequest.getBytes(StandardCharsets.UTF_8)));
		}
		catch (NoSuchAlgorithmException error) {
			throw new IllegalStateException("SHA-256 해시 알고리즘을 사용할 수 없습니다", error);
		}
	}

}

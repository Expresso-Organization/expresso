package com.expresso.backend.career.application;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.format.DateTimeParseException;
import java.util.Base64;
import java.util.Objects;
import java.util.UUID;

import org.springframework.stereotype.Service;

import com.expresso.backend.career.domain.CareerRecord;

@Service
public class CareerRecordListService implements ListCareerRecordsUseCase {

	private static final int MAX_CURSOR_LENGTH = 512;
	private final CareerRecordListRepository recordRepository;

	public CareerRecordListService(CareerRecordListRepository recordRepository) {
		this.recordRepository = Objects.requireNonNull(recordRepository, "recordRepository는 null일 수 없습니다");
	}

	@Override
	public CareerRecordPage list(String ownerId, String categoryId, int limit, String cursor) {
		Objects.requireNonNull(ownerId, "ownerId는 null일 수 없습니다");
		Objects.requireNonNull(categoryId, "categoryId는 null일 수 없습니다");
		if (limit < 1 || limit > 100) {
			throw new CareerRecordValidationException("limit은 1 이상 100 이하여야 합니다");
		}
		var boundary = decodeCursor(cursor, categoryId);
		var records = recordRepository.findOwnedCanonicalPage(
				ownerId,
				categoryId,
				boundary == null ? null : boundary.updatedAt(),
				boundary == null ? null : boundary.recordId(),
				limit + 1);
		var hasNextPage = records.size() > limit;
		var pageRecords = hasNextPage ? records.subList(0, limit) : records;
		var nextCursor = hasNextPage ? encodeCursor(categoryId, pageRecords.getLast()) : null;
		return new CareerRecordPage(pageRecords, hasNextPage, nextCursor);
	}

	private static String encodeCursor(String categoryId, CareerRecord record) {
		var value = String.join("\n", "1", categoryId, record.updatedAt().toString(), record.id());
		return Base64.getUrlEncoder().withoutPadding().encodeToString(value.getBytes(StandardCharsets.UTF_8));
	}

	private static CursorBoundary decodeCursor(String cursor, String categoryId) {
		if (cursor == null) return null;
		if (cursor.isBlank() || cursor.length() > MAX_CURSOR_LENGTH) {
			throw invalidCursor();
		}
		try {
			var decoded = new String(Base64.getUrlDecoder().decode(cursor), StandardCharsets.UTF_8);
			var fields = decoded.split("\n", -1);
			if (fields.length != 4 || !"1".equals(fields[0]) || !categoryId.equals(fields[1])) {
				throw invalidCursor();
			}
			var updatedAt = Instant.parse(fields[2]);
			var recordId = UUID.fromString(fields[3]).toString();
			return new CursorBoundary(updatedAt, recordId);
		}
		catch (IllegalArgumentException | DateTimeParseException exception) {
			throw invalidCursor();
		}
	}

	private static CareerRecordValidationException invalidCursor() {
		return new CareerRecordValidationException("cursor가 현재 categoryId의 페이지 상태와 일치하지 않습니다");
	}

	private record CursorBoundary(Instant updatedAt, String recordId) {
	}
}

package com.expresso.backend.career.domain;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.time.Instant;
import java.util.List;
import java.util.stream.IntStream;

import org.junit.jupiter.api.Test;

class CareerRecordChangeSetTest {

	private static final String RECORD_ID = "10ecce84-8d6b-4b76-87de-ec76729f9b90";
	private static final String OWNER_ID = "bc2f9791-0bb1-4a31-a23d-ea720f31284d";
	private static final String CATEGORY_ID = "475106fc-bf88-4a73-9c27-66c648733936";
	private static final String PARAGRAPH_ID = "fb122c86-7db8-41c3-a9d9-7a12c4758b08";
	private static final Instant CREATED_AT = Instant.parse("2026-09-02T12:00:00Z");
	private static final Instant CHANGED_AT = Instant.parse("2026-09-02T13:00:00Z");

	@Test
	void incrementsVersionOnceAndUpdatesTimeWhenOneCanonicalFieldChanges() {
		var record = emptyRecord();

		var changed = record.apply(CareerRecordChangeSet.none().withTitle("새 제목"), CHANGED_AT);

		assertEquals("새 제목", changed.title());
		assertEquals(2, changed.version());
		assertEquals(CHANGED_AT, changed.updatedAt());
	}

	@Test
	void incrementsVersionExactlyOnceWhenAllCanonicalFieldsChangeTogether() {
		var record = emptyRecord();
		var propertyValues = List.of(new TextPropertyValue(propertyDefinitionId(0), "백엔드 개발자"));
		var blockBody = new BlockBody(List.of(
				new ParagraphBlock("e692c2ed-57f7-4f0d-af15-493375323134", List.of(new TextSpan("본문")))));
		var changeSet = CareerRecordChangeSet.none()
				.withTitle("새 제목")
				.withPropertyValues(propertyValues)
				.withBlockBody(blockBody);

		var changed = record.apply(changeSet, CHANGED_AT);

		assertEquals("새 제목", changed.title());
		assertEquals(propertyValues, changed.propertyValues());
		assertEquals(blockBody, changed.blockBody());
		assertEquals(2, changed.version());
		assertEquals(CHANGED_AT, changed.updatedAt());
	}

	@Test
	void rejectsTheWholeChangeSetBeforeApplyingAnyValidField() {
		var record = emptyRecord();
		var invalid = CareerRecordChangeSet.none()
				.withTitle("적용되면 안 되는 제목")
				.withPropertyValues(propertyValues(51));

		assertThrows(IllegalArgumentException.class, () -> record.apply(invalid, CHANGED_AT));
		assertEquals("", record.title());
		assertEquals(1, record.version());
		assertEquals(CREATED_AT, record.updatedAt());
	}

	@Test
	void keepsVersionAndTimeWhenEverySuppliedValueIsUnchanged() {
		var record = emptyRecord();
		var noOp = CareerRecordChangeSet.none()
				.withTitle(record.title())
				.withPropertyValues(record.propertyValues())
				.withBlockBody(record.blockBody());

		var unchanged = record.apply(noOp, CHANGED_AT);

		assertSame(record, unchanged);
		assertEquals(1, unchanged.version());
		assertEquals(CREATED_AT, unchanged.updatedAt());
	}

	private static CareerRecord emptyRecord() {
		return CareerRecord.create(RECORD_ID, OWNER_ID, CATEGORY_ID, PARAGRAPH_ID, CREATED_AT);
	}

	private static List<TextPropertyValue> propertyValues(int count) {
		return IntStream.range(0, count)
				.mapToObj(index -> new TextPropertyValue(propertyDefinitionId(index), "값"))
				.toList();
	}

	private static String propertyDefinitionId(int index) {
		return "00000000-0000-0000-0000-%012d".formatted(index);
	}

}

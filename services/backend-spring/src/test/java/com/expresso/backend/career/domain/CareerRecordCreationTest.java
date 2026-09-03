package com.expresso.backend.career.domain;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Instant;
import java.util.List;
import java.util.stream.IntStream;

import org.junit.jupiter.api.Test;

class CareerRecordCreationTest {

	private static final String RECORD_ID = "10ecce84-8d6b-4b76-87de-ec76729f9b90";
	private static final String OWNER_ID = "bc2f9791-0bb1-4a31-a23d-ea720f31284d";
	private static final String CATEGORY_ID = "475106fc-bf88-4a73-9c27-66c648733936";
	private static final String PARAGRAPH_ID = "fb122c86-7db8-41c3-a9d9-7a12c4758b08";
	private static final Instant CREATED_AT = Instant.parse("2026-09-02T12:00:00Z");

	@Test
	void createsAnEmptyCanonicalRecordAtVersionOne() {
		var record = CareerRecord.create(RECORD_ID, OWNER_ID, CATEGORY_ID, PARAGRAPH_ID, CREATED_AT);

		assertEquals(RECORD_ID, record.id());
		assertEquals(OWNER_ID, record.ownerId());
		assertEquals(CATEGORY_ID, record.categoryId());
		assertEquals("", record.title());
		assertTrue(record.propertyValues().isEmpty());
		assertEquals(1, record.version());
		assertEquals(CREATED_AT, record.updatedAt());
	}

	@Test
	void createsAnEmptyBodyWithExactlyOneEmptyParagraph() {
		var record = CareerRecord.create(RECORD_ID, OWNER_ID, CATEGORY_ID, PARAGRAPH_ID, CREATED_AT);

		assertEquals(1, record.blockBody().paragraphs().size());
		assertEquals(PARAGRAPH_ID, record.blockBody().paragraphs().getFirst().id());
		assertTrue(record.blockBody().paragraphs().getFirst().text().isEmpty());
	}

	@Test
	void acceptsATitleWithThreeHundredCharacters() {
		var record = recordWith("가".repeat(300), List.of());

		assertEquals(300, record.title().length());
	}

	@Test
	void rejectsATitleWithThreeHundredAndOneCharacters() {
		assertThrows(IllegalArgumentException.class, () -> recordWith("가".repeat(301), List.of()));
	}

	@Test
	void acceptsATextPropertyValueWithFiveThousandCharacters() {
		var value = new TextPropertyValue(propertyDefinitionId(0), "가".repeat(5_000));

		assertEquals(5_000, value.value().length());
	}

	@Test
	void rejectsATextPropertyValueWithFiveThousandAndOneCharacters() {
		assertThrows(IllegalArgumentException.class,
				() -> new TextPropertyValue(propertyDefinitionId(0), "가".repeat(5_001)));
	}

	@Test
	void acceptsFiftyPropertyValues() {
		var record = recordWith("", propertyValues(50));

		assertEquals(50, record.propertyValues().size());
	}

	@Test
	void rejectsFiftyOnePropertyValues() {
		assertThrows(IllegalArgumentException.class, () -> recordWith("", propertyValues(51)));
	}

	@Test
	void rejectsDuplicatePropertyDefinitionIdsEvenWhenValuesDiffer() {
		var duplicatedId = propertyDefinitionId(0);
		var values = List.of(
				new TextPropertyValue(duplicatedId, "첫 값"),
				new TextPropertyValue(duplicatedId, "다른 값"));

		assertThrows(IllegalArgumentException.class, () -> recordWith("", values));
	}

	@Test
	void rejectsAnEmptyTextSpan() {
		assertThrows(IllegalArgumentException.class, () -> new TextSpan(""));
	}

	@Test
	void enforcesTheTextSpanMaximumLength() {
		assertEquals(200_000, new TextSpan("가".repeat(200_000)).text().length());
		assertThrows(IllegalArgumentException.class, () -> new TextSpan("가".repeat(200_001)));
	}

	@Test
	void rejectsABlockBodyWithoutParagraphs() {
		assertThrows(IllegalArgumentException.class, () -> new BlockBody(List.of()));
	}

	@Test
	void rejectsNullRequiredAggregateFields() {
		var body = emptyBody();

		assertThrows(NullPointerException.class,
				() -> new CareerRecord(null, OWNER_ID, CATEGORY_ID, "", List.of(), body, 1, CREATED_AT));
		assertThrows(NullPointerException.class,
				() -> new CareerRecord(RECORD_ID, null, CATEGORY_ID, "", List.of(), body, 1, CREATED_AT));
		assertThrows(NullPointerException.class,
				() -> new CareerRecord(RECORD_ID, OWNER_ID, null, "", List.of(), body, 1, CREATED_AT));
		assertThrows(NullPointerException.class,
				() -> new CareerRecord(RECORD_ID, OWNER_ID, CATEGORY_ID, null, List.of(), body, 1, CREATED_AT));
		assertThrows(NullPointerException.class,
				() -> new CareerRecord(RECORD_ID, OWNER_ID, CATEGORY_ID, "", null, body, 1, CREATED_AT));
		assertThrows(NullPointerException.class,
				() -> new CareerRecord(RECORD_ID, OWNER_ID, CATEGORY_ID, "", List.of(), null, 1, CREATED_AT));
		assertThrows(NullPointerException.class,
				() -> new CareerRecord(RECORD_ID, OWNER_ID, CATEGORY_ID, "", List.of(), body, 1, null));
	}

	@Test
	void rejectsNullRequiredCanonicalComponentFields() {
		assertThrows(NullPointerException.class, () -> new TextPropertyValue(null, "값"));
		assertThrows(NullPointerException.class, () -> new TextPropertyValue(propertyDefinitionId(0), null));
		assertThrows(NullPointerException.class, () -> new BlockBody(null));
		assertThrows(NullPointerException.class, () -> new ParagraphBlock(null, List.of()));
		assertThrows(NullPointerException.class, () -> new ParagraphBlock(PARAGRAPH_ID, null));
		assertThrows(NullPointerException.class, () -> new TextSpan(null));
	}

	@Test
	void rejectsVersionsBelowOne() {
		assertThrows(IllegalArgumentException.class,
				() -> new CareerRecord(RECORD_ID, OWNER_ID, CATEGORY_ID, "", List.of(), emptyBody(), 0, CREATED_AT));
	}

	private static CareerRecord recordWith(String title, List<TextPropertyValue> propertyValues) {
		return new CareerRecord(
				RECORD_ID, OWNER_ID, CATEGORY_ID, title, propertyValues, emptyBody(), 1, CREATED_AT);
	}

	private static BlockBody emptyBody() {
		return new BlockBody(List.of(new ParagraphBlock(PARAGRAPH_ID, List.of())));
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

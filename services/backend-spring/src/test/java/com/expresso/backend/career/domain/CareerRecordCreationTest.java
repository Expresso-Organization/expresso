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

		assertEquals(1, record.blockBody().content().size());
		assertEquals(PARAGRAPH_ID, record.blockBody().content().getFirst().id());
		assertEquals("paragraph", record.blockBody().content().getFirst().type());
		assertTrue(record.blockBody().content().getFirst().attrs().isEmpty());
		assertTrue(record.blockBody().content().getFirst().content().isEmpty());
		assertTrue(record.blockBody().content().getFirst().text().isEmpty());
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
	void acceptsAnEmptyTextSpan() {
		assertEquals("", new TextSpan("", List.of()).text());
	}

	@Test
	void enforcesTheTextSpanMaximumLength() {
		var maximum = new TextSpan("😀".repeat(200_000), List.of());
		assertEquals(200_000, maximum.text().codePointCount(0, maximum.text().length()));
		assertThrows(IllegalArgumentException.class, () -> new BlockBody(List.of(new SemanticBlock(
				PARAGRAPH_ID, "paragraph", java.util.Map.of(), List.of(),
				List.of(new TextSpan("😀".repeat(200_001), List.of()))))));
	}

	@Test
	void acceptsABlockBodyWithoutBlocks() {
		assertTrue(new BlockBody(List.<SemanticBlock>of()).content().isEmpty());
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
		assertThrows(NullPointerException.class, () -> new BlockBody((List<SemanticBlock>) null));
		assertThrows(NullPointerException.class,
				() -> new SemanticBlock(null, "paragraph", java.util.Map.of(), List.of(), List.of()));
		assertThrows(NullPointerException.class,
				() -> new SemanticBlock(PARAGRAPH_ID, null, java.util.Map.of(), List.of(), List.of()));
		assertThrows(NullPointerException.class,
				() -> new SemanticBlock(PARAGRAPH_ID, "paragraph", null, List.of(), List.of()));
		assertThrows(NullPointerException.class,
				() -> new SemanticBlock(PARAGRAPH_ID, "paragraph", java.util.Map.of(), null, List.of()));
		assertThrows(NullPointerException.class,
				() -> new SemanticBlock(PARAGRAPH_ID, "paragraph", java.util.Map.of(), List.of(), null));
		assertThrows(NullPointerException.class, () -> new TextSpan(null, List.of()));
		assertThrows(NullPointerException.class, () -> new TextSpan("본문", null));
		assertThrows(NullPointerException.class, () -> new TextMark(null, java.util.Map.of()));
		assertThrows(NullPointerException.class, () -> new TextMark("bold", null));
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
		return new BlockBody(List.of(new SemanticBlock(
				PARAGRAPH_ID, "paragraph", java.util.Map.of(), List.of(), List.of())));
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

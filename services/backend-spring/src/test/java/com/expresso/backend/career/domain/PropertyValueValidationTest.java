package com.expresso.backend.career.domain;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.Test;

class PropertyValueValidationTest {

	private static final String DEFINITION_ID = "f3b3693d-2b90-526a-9e13-81d8f64e9e09";
	private static final String OPTION_ID = "0e75e21a-a7d9-5ee9-aa10-92a66f8c6a04";
	private static final String ASSET_ID = "28bfffa4-ffbb-4e8d-96d4-ab9cb1e36231";

	@Test
	void supportsAllWritablePropertyValueTypes() {
		var values = List.<PropertyValue>of(
				new TextualPropertyValue(DEFINITION_ID, PropertyValueType.TEXT, "본문"),
				new NumberPropertyValue(DEFINITION_ID, new BigDecimal("12.50")),
				new CheckboxPropertyValue(DEFINITION_ID, true),
				new SelectPropertyValue(DEFINITION_ID, OPTION_ID),
				new MultiSelectPropertyValue(DEFINITION_ID, List.of(OPTION_ID)),
				new DatePropertyValue(DEFINITION_ID, DatePropertyValue.Precision.MONTH, "2026-09", null, null),
				new TextualPropertyValue(DEFINITION_ID, PropertyValueType.URL, "https://example.com"),
				new TextualPropertyValue(DEFINITION_ID, PropertyValueType.EMAIL, "dev@example.com"),
				new TextualPropertyValue(DEFINITION_ID, PropertyValueType.PHONE, "+82-10-1234-5678"),
				new AssetPropertyValue(DEFINITION_ID, PropertyValueType.FILE, List.of(ASSET_ID)),
				new AssetPropertyValue(DEFINITION_ID, PropertyValueType.MEDIA, List.of(ASSET_ID)));

		assertEquals(List.of(
				PropertyValueType.TEXT,
				PropertyValueType.NUMBER,
				PropertyValueType.CHECKBOX,
				PropertyValueType.SELECT,
				PropertyValueType.MULTI_SELECT,
				PropertyValueType.DATE,
				PropertyValueType.URL,
				PropertyValueType.EMAIL,
				PropertyValueType.PHONE,
				PropertyValueType.FILE,
				PropertyValueType.MEDIA), values.stream().map(PropertyValue::type).toList());
	}

	@Test
	void validatesTextByUnicodeCodePointAndCanonicalLimits() {
		var maximumText = "😀".repeat(50_000);
		assertEquals(maximumText,
				new TextualPropertyValue(DEFINITION_ID, PropertyValueType.TEXT, maximumText).value());
		assertThrows(IllegalArgumentException.class,
				() -> new TextualPropertyValue(DEFINITION_ID, PropertyValueType.TEXT, "😀".repeat(50_001)));

		assertEquals(2_000,
				new TextualPropertyValue(DEFINITION_ID, PropertyValueType.URL, "가".repeat(2_000))
						.value().length());
		assertThrows(IllegalArgumentException.class,
				() -> new TextualPropertyValue(DEFINITION_ID, PropertyValueType.EMAIL, "가".repeat(2_001)));
	}

	@Test
	void preservesDecimalScaleForLosslessWireRoundTrip() {
		var value = new NumberPropertyValue(DEFINITION_ID, new BigDecimal("12.500"));

		assertEquals(new BigDecimal("12.500"), value.value());
	}

	@Test
	void validatesOptionAndAssetUuidValues() {
		assertEquals(null, new SelectPropertyValue(DEFINITION_ID, null).value());
		assertThrows(IllegalArgumentException.class,
				() -> new SelectPropertyValue(DEFINITION_ID, "not-a-uuid"));
		assertThrows(IllegalArgumentException.class,
				() -> new MultiSelectPropertyValue(DEFINITION_ID, List.of("not-a-uuid")));
		assertThrows(IllegalArgumentException.class,
				() -> new AssetPropertyValue(DEFINITION_ID, PropertyValueType.FILE, List.of("not-a-uuid")));
	}

	@Test
	void preservesOrderAndDuplicatesWhileDefensivelyCopyingLists() {
		var mutableOptions = new ArrayList<>(List.of(OPTION_ID, OPTION_ID));
		var value = new MultiSelectPropertyValue(DEFINITION_ID, mutableOptions);
		mutableOptions.clear();

		assertEquals(List.of(OPTION_ID, OPTION_ID), value.value());
		assertThrows(UnsupportedOperationException.class, () -> value.value().add(OPTION_ID));
	}

	@Test
	void limitsOptionAndAssetListsToOneHundredItems() {
		var oneHundredOptions = java.util.Collections.nCopies(100, OPTION_ID);
		assertEquals(100, new MultiSelectPropertyValue(DEFINITION_ID, oneHundredOptions).value().size());
		assertThrows(IllegalArgumentException.class,
				() -> new MultiSelectPropertyValue(
						DEFINITION_ID, java.util.Collections.nCopies(101, OPTION_ID)));
		assertThrows(IllegalArgumentException.class,
				() -> new AssetPropertyValue(
						DEFINITION_ID, PropertyValueType.MEDIA,
						java.util.Collections.nCopies(101, ASSET_ID)));
	}

	@Test
	void validatesMonthDayAndDatetimePrecision() {
		assertEquals("2026-09", new DatePropertyValue(
				DEFINITION_ID, DatePropertyValue.Precision.MONTH, "2026-09", "2026-10", null).start());
		assertEquals("2026-09-07", new DatePropertyValue(
				DEFINITION_ID, DatePropertyValue.Precision.DAY, "2026-09-07", null, null).start());
		assertEquals("Asia/Seoul", new DatePropertyValue(
				DEFINITION_ID,
				DatePropertyValue.Precision.DATETIME,
				"2026-09-07T12:30:00+09:00",
				null,
				"Asia/Seoul").timezone());
	}

	@Test
	void rejectsInvalidDateShapeRangeAndTimezone() {
		assertThrows(IllegalArgumentException.class,
				() -> new DatePropertyValue(
						DEFINITION_ID, DatePropertyValue.Precision.MONTH, "2026-9", null, null));
		assertThrows(IllegalArgumentException.class,
				() -> new DatePropertyValue(
						DEFINITION_ID, DatePropertyValue.Precision.DAY, "2026-02-30", null, null));
		assertThrows(IllegalArgumentException.class,
				() -> new DatePropertyValue(
						DEFINITION_ID,
						DatePropertyValue.Precision.DATETIME,
						"2026-09-07T12:30:00",
						null,
						null));
		assertThrows(IllegalArgumentException.class,
				() -> new DatePropertyValue(
						DEFINITION_ID, DatePropertyValue.Precision.MONTH, "2026-09", null, "Asia/Seoul"));
		assertThrows(IllegalArgumentException.class,
				() -> new DatePropertyValue(
						DEFINITION_ID,
						DatePropertyValue.Precision.DATETIME,
						"2026-09-07T12:30:00+09:00",
						null,
						"not/a-zone"));
		assertThrows(IllegalArgumentException.class,
				() -> new DatePropertyValue(
						DEFINITION_ID, DatePropertyValue.Precision.DAY,
						"2026-09-08", "2026-09-07", null));
	}

	@Test
	void rejectsTypeAndValueShapeMismatches() {
		assertThrows(IllegalArgumentException.class,
				() -> new TextualPropertyValue(DEFINITION_ID, PropertyValueType.NUMBER, "12"));
		assertThrows(IllegalArgumentException.class,
				() -> new AssetPropertyValue(DEFINITION_ID, PropertyValueType.TEXT, List.of(ASSET_ID)));
		assertThrows(IllegalArgumentException.class,
				() -> PropertyValueType.valueOf("TITLE"));
	}

	@Test
	void rejectsInvalidPropertyDefinitionIdentity() {
		assertThrows(NullPointerException.class,
				() -> new TextualPropertyValue(null, PropertyValueType.TEXT, "값"));
		assertThrows(IllegalArgumentException.class,
				() -> new CheckboxPropertyValue("not-a-uuid", true));
	}
}

package com.expresso.backend.career.infrastructure.mongo;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

import org.bson.Document;
import org.bson.types.Decimal128;
import org.junit.jupiter.api.Test;

import com.expresso.backend.career.domain.AssetPropertyValue;
import com.expresso.backend.career.domain.BlockBody;
import com.expresso.backend.career.domain.CareerRecord;
import com.expresso.backend.career.domain.CheckboxPropertyValue;
import com.expresso.backend.career.domain.DatePropertyValue;
import com.expresso.backend.career.domain.MultiSelectPropertyValue;
import com.expresso.backend.career.domain.NumberPropertyValue;
import com.expresso.backend.career.domain.PropertyValue;
import com.expresso.backend.career.domain.PropertyValueType;
import com.expresso.backend.career.domain.SelectPropertyValue;
import com.expresso.backend.career.domain.TextualPropertyValue;

class MongoCareerPropertyValueRoundTripTest {

	private static final String RECORD_ID = "10ecce84-8d6b-4b76-87de-ec76729f9b90";
	private static final String OWNER_ID = "bc2f9791-0bb1-4a31-a23d-ea720f31284d";
	private static final String CATEGORY_ID = "475106fc-bf88-4a73-9c27-66c648733936";
	private static final String OPTION_A = "20000000-0000-4000-8000-000000000001";
	private static final String OPTION_B = "20000000-0000-4000-8000-000000000002";
	private static final String ASSET_A = "30000000-0000-4000-8000-000000000001";
	private static final String ASSET_B = "30000000-0000-4000-8000-000000000002";

	private final MongoCareerRecordWriter writer = new MongoCareerRecordWriter();
	private final MongoCareerRecordProjector projector = new MongoCareerRecordProjector();

	@Test
	void roundTripsEveryWritablePropertyValueWithoutLosingBsonMeaning() {
		var record = recordWith(allPropertyValues());

		var written = writer.write(record, "idempotency-key", "request-hash");
		var storedValues = written.getList("propertyValues", Document.class);

		assertInstanceOf(Decimal128.class, storedValues.get(1).get("value"));
		assertEquals("42.500", storedValues.get(1).get("value", Decimal128.class).toString());
		assertEquals(record, projector.project(written));
	}

	@Test
	void rejectsMalformedCanonicalPropertyValueInsteadOfUsingLegacyData() {
		var document = writer.write(recordWith(List.of()), "idempotency-key", "request-hash");
		document.put("propertyValues", List.of(new Document()
				.append("propertyDefinitionId", id(2))
				.append("type", "number")
				.append("value", "42.5")));
		document.put("properties", new Document("score", 42.5));

		assertThrows(IllegalStateException.class, () -> projector.project(document));
	}

	private static List<PropertyValue> allPropertyValues() {
		return List.of(
				new TextualPropertyValue(id(1), PropertyValueType.TEXT, "본문"),
				new NumberPropertyValue(id(2), new BigDecimal("42.500")),
				new CheckboxPropertyValue(id(3), true),
				new SelectPropertyValue(id(4), OPTION_A),
				new MultiSelectPropertyValue(id(5), List.of(OPTION_B, OPTION_A, OPTION_B)),
				new DatePropertyValue(id(6), DatePropertyValue.Precision.MONTH,
						"2026-09", "2026-12", null),
				new DatePropertyValue(id(7), DatePropertyValue.Precision.DAY,
						"2026-09-05", "2026-09-30", null),
				new DatePropertyValue(id(8), DatePropertyValue.Precision.DATETIME,
						"2026-09-05T09:30:00+09:00", null, "Asia/Seoul"),
				new TextualPropertyValue(id(9), PropertyValueType.URL, "https://example.com"),
				new TextualPropertyValue(id(10), PropertyValueType.EMAIL, "career@example.com"),
				new TextualPropertyValue(id(11), PropertyValueType.PHONE, "+82-10-1234-5678"),
				new AssetPropertyValue(id(12), PropertyValueType.FILE, List.of(ASSET_A)),
				new AssetPropertyValue(id(13), PropertyValueType.MEDIA, List.of(ASSET_B)));
	}

	private static CareerRecord recordWith(List<PropertyValue> values) {
		return new CareerRecord(
				RECORD_ID,
				OWNER_ID,
				CATEGORY_ID,
				"기록",
				values,
				new BlockBody(List.of()),
				3,
				Instant.parse("2026-09-08T00:00:00Z"));
	}

	private static String id(int suffix) {
		return "10000000-0000-4000-8000-%012d".formatted(suffix);
	}
}

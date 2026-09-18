package com.expresso.backend.career.api;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

import tools.jackson.databind.ObjectMapper;

class CanonicalDecimal128ParserTest {

	private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

	@Test
	void matchesTheSharedDecimal128AllowRejectCorpus() throws IOException {
		var fixturePath = Path.of("..", "..", "packages", "contracts", "openapi", "fixtures",
				"career-decimal128-v1.json");
		@SuppressWarnings("unchecked")
		var fixture = (Map<String, Object>) OBJECT_MAPPER.readValue(Files.readAllBytes(fixturePath), Map.class);
		@SuppressWarnings("unchecked")
		var cases = (List<Map<String, Object>>) fixture.get("cases");

		for (var boundary : cases) {
			var value = fixtureValue(asMap(boundary.get("value")));
			var fieldName = "propertyValues.number.value";
			if (Boolean.TRUE.equals(boundary.get("accepted"))) {
				var parsed = assertDoesNotThrow(() -> CanonicalDecimal128Parser.parse(value, fieldName),
						String.valueOf(boundary.get("name")));
				if (boundary.get("fractionalScale") instanceof Number scale) {
					assertEquals(scale.intValue(), Math.max(parsed.scale(), 0), String.valueOf(boundary.get("name")));
				}
			}
			else {
				assertThrows(CareerRecordRequestValidationException.class,
						() -> CanonicalDecimal128Parser.parse(value, fieldName), String.valueOf(boundary.get("name")));
			}
		}
	}

	private static String fixtureValue(Map<String, Object> value) {
		if (value.get("literal") instanceof String literal) return literal;
		return String.valueOf(value.get("prefix"))
				+ String.valueOf(value.get("repeat")).repeat(((Number) value.get("count")).intValue())
				+ String.valueOf(value.get("suffix"));
	}

	@SuppressWarnings("unchecked")
	private static Map<String, Object> asMap(Object value) {
		return (Map<String, Object>) value;
	}
}

package com.expresso.backend.career.infrastructure.mongo;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.io.IOException;
import java.math.BigDecimal;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.Date;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.bson.Document;
import org.bson.types.Decimal128;
import org.bson.types.ObjectId;
import org.junit.jupiter.api.Test;

import com.expresso.backend.career.domain.BlockBody;
import com.expresso.backend.career.domain.CareerRecord;
import com.expresso.backend.career.domain.SemanticBlock;
import com.expresso.backend.career.domain.TextMark;
import com.expresso.backend.career.domain.TextSpan;
import com.expresso.backend.career.domain.TextualPropertyValue;

import tools.jackson.databind.ObjectMapper;

class MongoCareerRecordProjectorTest {

	private static final String RECORD_ID = "10ecce84-8d6b-4b76-87de-ec76729f9b90";
	private static final String OWNER_ID = "bc2f9791-0bb1-4a31-a23d-ea720f31284d";
	private static final String CATEGORY_ID = "475106fc-bf88-4a73-9c27-66c648733936";
	private static final String PROPERTY_DEFINITION_ID = "fd1061b5-d8db-5a5a-8855-51530c98db3f";
	private static final String PARAGRAPH_ID = "fb122c86-7db8-41c3-a9d9-7a12c4758b08";
	private static final Instant UPDATED_AT = Instant.parse("2026-09-03T03:00:00Z");
	private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

	private final MongoCareerRecordProjector projector = new MongoCareerRecordProjector();
	private final MongoCareerRecordWriter writer = new MongoCareerRecordWriter();

	@Test
	void roundTripsSharedRichAndUnknownDocuments() throws IOException {
		var fixtures = readSharedFixtures();

		for (var fixtureName : List.of("richNested", "unknownBlock")) {
			var body = readBody(asMap(fixtures.get(fixtureName)));

			var projected = projector.project(writer.write(recordWith(body), "idempotency-key", "request-hash"));

			assertEquals(body, projected.blockBody(), fixtureName);
		}
	}

	@Test
	void roundTripsEverySupportedJsonValueInBlockAndMarkAttrs() {
		var blockAttrs = jsonValues("block");
		var markAttrs = jsonValues("mark");
		markAttrs.put("href", "https://example.com");
		var body = new BlockBody(List.of(new SemanticBlock(
				PARAGRAPH_ID,
				"future.values",
				blockAttrs,
				List.of(),
				List.of(new TextSpan("값", List.of(new TextMark("link", markAttrs)))))));

		var written = writer.write(recordWith(body), "idempotency-key", "request-hash");
		var writtenBlock = asDocument(asList(asDocument(written.get("blockBody")).get("content")).getFirst());
		var writtenAttrs = asDocument(writtenBlock.get("attrs"));
		var writtenMark = asDocument(asList(asDocument(asList(writtenBlock.get("text")).getFirst()).get("marks")).getFirst());
		var writtenMarkAttrs = asDocument(writtenMark.get("attrs"));

		assertEquals(7L, writtenAttrs.get("integer"));
		assertInstanceOf(Decimal128.class, writtenAttrs.get("decimal"));
		assertNull(writtenAttrs.get("nullable"));
		assertEquals(7L, writtenMarkAttrs.get("integer"));
		assertInstanceOf(Decimal128.class, writtenMarkAttrs.get("decimal"));
		assertEquals(body, projector.project(written).blockBody());
	}

	@Test
	void roundTripsAnEmptyRootDocument() {
		var body = new BlockBody(List.<SemanticBlock>of());

		var projected = projector.project(writer.write(recordWith(body), "idempotency-key", "request-hash"));

		assertEquals(body, projected.blockBody());
	}

	@Test
	void projectsACompleteCanonicalDocument() {
		var record = projector.project(canonicalDocument());

		assertEquals(RECORD_ID, record.id());
		assertEquals(OWNER_ID, record.ownerId());
		assertEquals(CATEGORY_ID, record.categoryId());
		assertEquals("Canonical title", record.title());
		assertEquals(PROPERTY_DEFINITION_ID, record.propertyValues().getFirst().propertyDefinitionId());
		assertEquals("Canonical property", textPropertyValue(record).value());
		assertEquals(PARAGRAPH_ID, record.blockBody().content().getFirst().id());
		assertEquals("Canonical body", record.blockBody().content().getFirst().text().getFirst().text());
		assertEquals(7, record.version());
		assertEquals(UPDATED_AT, record.updatedAt());
	}

	@Test
	void projectsCanonicalContentWhenLegacyFieldsCoexist() {
		var document = transitionDocument()
			.append("properties", new Document("role", "Canonical property"))
			.append("bodyMd", "Canonical body");

		var record = projector.project(document);

		assertEquals("Canonical property", textPropertyValue(record).value());
		assertEquals("Canonical body", record.blockBody().content().getFirst().text().getFirst().text());
	}

	@Test
	void prefersCanonicalContentWhenLegacyContentDisagrees() {
		var document = transitionDocument()
			.append("properties", new Document("role", "Legacy property"))
			.append("bodyMd", "Legacy body");

		var record = projector.project(document);

		assertEquals("Canonical property", textPropertyValue(record).value());
		assertEquals("Canonical body", record.blockBody().content().getFirst().text().getFirst().text());
	}

	@Test
	void rejectsALegacyOnlyDocument() {
		var document = transitionDocument();
		document.remove("propertyValues");
		document.remove("blockBody");

		assertThrows(IllegalStateException.class, () -> projector.project(document));
	}

	@Test
	void rejectsAPartialCanonicalDocumentWithOnlyPropertyValues() {
		var document = transitionDocument();
		document.remove("blockBody");

		assertThrows(IllegalStateException.class, () -> projector.project(document));
	}

	@Test
	void rejectsAPartialCanonicalDocumentWithOnlyBlockBody() {
		var document = transitionDocument();
		document.remove("propertyValues");

		assertThrows(IllegalStateException.class, () -> projector.project(document));
	}

	@Test
	void ignoresMalformedLegacyValuesWhenCanonicalContentIsValid() {
		var document = transitionDocument()
			.append("properties", "not-an-object")
			.append("bodyMd", new Document("unexpected", true));

		var record = projector.project(document);

		assertEquals("Canonical property", textPropertyValue(record).value());
		assertEquals("Canonical body", record.blockBody().content().getFirst().text().getFirst().text());
	}

	@Test
	void rejectsMalformedKnownBlockThroughTheExistingProjectionFailurePolicy() {
		var document = canonicalDocument();
		var body = asDocument(document.get("blockBody"));
		body.put("content", List.of(new Document()
				.append("id", PARAGRAPH_ID)
				.append("type", "paragraph")
				.append("attrs", new Document())
				.append("content", List.of(new Document()
						.append("id", "f3709f4e-eaa5-42b5-992d-20fc21e3c38b")
						.append("type", "paragraph")
						.append("attrs", new Document())))
				.append("text", List.of())));

		assertThrows(IllegalStateException.class, () -> projector.project(document));
	}

	@Test
	void rejectsUnsupportedBsonValuesInAttrs() {
		var document = canonicalDocument();
		var body = asDocument(document.get("blockBody"));
		var block = asDocument(asList(body.get("content")).getFirst());
		block.put("attrs", new Document("objectId", new ObjectId()));

		assertThrows(IllegalStateException.class, () -> projector.project(document));

		block.put("attrs", new Document("notFinite", Decimal128.POSITIVE_INFINITY));

		assertThrows(IllegalStateException.class, () -> projector.project(document));
	}

	private static Document canonicalDocument() {
		return new Document("_id", RECORD_ID)
			.append("userId", OWNER_ID)
			.append("categoryId", CATEGORY_ID)
			.append("title", "Canonical title")
			.append("propertyValues", List.of(new Document()
				.append("propertyDefinitionId", PROPERTY_DEFINITION_ID)
				.append("type", "text")
				.append("value", "Canonical property")))
			.append("blockBody", new Document()
				.append("schemaVersion", 1)
				.append("type", "doc")
				.append("content", List.of(new Document()
					.append("id", PARAGRAPH_ID)
					.append("type", "paragraph")
					.append("attrs", new Document())
					.append("text", List.of(new Document("text", "Canonical body"))))))
			.append("editorSchemaVersion", 1)
			.append("version", 7L)
			.append("updatedAt", Date.from(UPDATED_AT));
	}

	private static Document transitionDocument() {
		return canonicalDocument()
			.append("status", "active")
			.append("origin", "manual")
			.append("properties", new Document("role", "Legacy property"))
			.append("bodyMd", "Legacy body");
	}

	private static CareerRecord recordWith(BlockBody body) {
		return new CareerRecord(
				RECORD_ID, OWNER_ID, CATEGORY_ID, "Canonical title", List.of(), body, 7, UPDATED_AT);
	}

	private static TextualPropertyValue textPropertyValue(CareerRecord record) {
		return assertInstanceOf(TextualPropertyValue.class, record.propertyValues().getFirst());
	}

	private static LinkedHashMap<String, Object> jsonValues(String prefix) {
		var values = new LinkedHashMap<String, Object>();
		values.put("nullable", null);
		values.put("boolean", true);
		values.put("integer", 7);
		values.put("decimal", new BigDecimal("12.50"));
		values.put("string", prefix + " value");
		values.put("array", List.of("first", 2, false));
		values.put("object", Map.of("nested", Map.of("value", prefix)));
		return values;
	}

	@SuppressWarnings("unchecked")
	private static Map<String, Object> readSharedFixtures() throws IOException {
		var fixturePath = Path.of("..", "..", "packages", "contracts", "openapi", "fixtures",
				"career-rich-block-body-v1.json");
		return (Map<String, Object>) OBJECT_MAPPER.readValue(Files.readAllBytes(fixturePath), Map.class);
	}

	private static BlockBody readBody(Map<String, Object> value) {
		return new BlockBody(asList(value.get("content")).stream()
				.map(item -> readBlock(asMap(item)))
				.toList());
	}

	private static SemanticBlock readBlock(Map<String, Object> value) {
		var content = value.containsKey("content")
				? asList(value.get("content")).stream().map(item -> readBlock(asMap(item))).toList()
				: List.<SemanticBlock>of();
		var text = value.containsKey("text")
				? asList(value.get("text")).stream().map(item -> readTextSpan(asMap(item))).toList()
				: List.<TextSpan>of();
		return new SemanticBlock(
				(String) value.get("id"), (String) value.get("type"), asMap(value.get("attrs")), content, text);
	}

	private static TextSpan readTextSpan(Map<String, Object> value) {
		var marks = value.containsKey("marks")
				? asList(value.get("marks")).stream().map(item -> readMark(asMap(item))).toList()
				: List.<TextMark>of();
		return new TextSpan((String) value.get("text"), marks);
	}

	private static TextMark readMark(Map<String, Object> value) {
		var attrs = value.containsKey("attrs") ? asMap(value.get("attrs")) : Map.<String, Object>of();
		return new TextMark((String) value.get("type"), attrs);
	}

	@SuppressWarnings("unchecked")
	private static Map<String, Object> asMap(Object value) {
		return (Map<String, Object>) value;
	}

	@SuppressWarnings("unchecked")
	private static List<Object> asList(Object value) {
		return (List<Object>) value;
	}

	private static Document asDocument(Object value) {
		return (Document) value;
	}

}

package com.expresso.backend.career.infrastructure.mongo;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.time.Instant;
import java.util.Date;
import java.util.List;

import org.bson.Document;
import org.junit.jupiter.api.Test;

class MongoCareerRecordProjectorTest {

	private static final String RECORD_ID = "10ecce84-8d6b-4b76-87de-ec76729f9b90";
	private static final String OWNER_ID = "bc2f9791-0bb1-4a31-a23d-ea720f31284d";
	private static final String CATEGORY_ID = "475106fc-bf88-4a73-9c27-66c648733936";
	private static final String PROPERTY_DEFINITION_ID = "fd1061b5-d8db-5a5a-8855-51530c98db3f";
	private static final String PARAGRAPH_ID = "fb122c86-7db8-41c3-a9d9-7a12c4758b08";
	private static final Instant UPDATED_AT = Instant.parse("2026-09-03T03:00:00Z");

	private final MongoCareerRecordProjector projector = new MongoCareerRecordProjector();

	@Test
	void projectsACompleteCanonicalDocument() {
		var record = projector.project(canonicalDocument());

		assertEquals(RECORD_ID, record.id());
		assertEquals(OWNER_ID, record.ownerId());
		assertEquals(CATEGORY_ID, record.categoryId());
		assertEquals("Canonical title", record.title());
		assertEquals(PROPERTY_DEFINITION_ID, record.propertyValues().getFirst().propertyDefinitionId());
		assertEquals("Canonical property", record.propertyValues().getFirst().value());
		assertEquals(PARAGRAPH_ID, record.blockBody().paragraphs().getFirst().id());
		assertEquals("Canonical body", record.blockBody().paragraphs().getFirst().text().getFirst().text());
		assertEquals(7, record.version());
		assertEquals(UPDATED_AT, record.updatedAt());
	}

	@Test
	void projectsCanonicalContentWhenLegacyFieldsCoexist() {
		var document = transitionDocument()
			.append("properties", new Document("role", "Canonical property"))
			.append("bodyMd", "Canonical body");

		var record = projector.project(document);

		assertEquals("Canonical property", record.propertyValues().getFirst().value());
		assertEquals("Canonical body", record.blockBody().paragraphs().getFirst().text().getFirst().text());
	}

	@Test
	void prefersCanonicalContentWhenLegacyContentDisagrees() {
		var document = transitionDocument()
			.append("properties", new Document("role", "Legacy property"))
			.append("bodyMd", "Legacy body");

		var record = projector.project(document);

		assertEquals("Canonical property", record.propertyValues().getFirst().value());
		assertEquals("Canonical body", record.blockBody().paragraphs().getFirst().text().getFirst().text());
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

		assertEquals("Canonical property", record.propertyValues().getFirst().value());
		assertEquals("Canonical body", record.blockBody().paragraphs().getFirst().text().getFirst().text());
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

}

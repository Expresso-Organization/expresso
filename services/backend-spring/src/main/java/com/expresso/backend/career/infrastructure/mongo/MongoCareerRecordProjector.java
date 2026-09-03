package com.expresso.backend.career.infrastructure.mongo;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Map;
import java.util.Objects;

import org.bson.Document;

import com.expresso.backend.career.domain.BlockBody;
import com.expresso.backend.career.domain.CareerRecord;
import com.expresso.backend.career.domain.ParagraphBlock;
import com.expresso.backend.career.domain.TextPropertyValue;
import com.expresso.backend.career.domain.TextSpan;

final class MongoCareerRecordProjector {

	CareerRecord project(Document document) {
		Objects.requireNonNull(document, "document는 null일 수 없습니다");
		requireCompleteCanonicalContent(document);

		return new CareerRecord(
				requiredString(document, "_id"),
				requiredString(document, "userId"),
				requiredString(document, "categoryId"),
				requiredString(document, "title"),
				projectPropertyValues(requiredList(document, "propertyValues")),
				projectBlockBody(requiredDocument(document, "blockBody")),
				requiredLong(document, "version"),
				requiredInstant(document, "updatedAt"));
	}

	private static void requireCompleteCanonicalContent(Document document) {
		if (!document.containsKey("propertyValues") || !document.containsKey("blockBody")) {
			throw projectionFailure("propertyValues와 blockBody가 모두 있어야 합니다");
		}
	}

	private static List<TextPropertyValue> projectPropertyValues(List<?> documents) {
		var values = new ArrayList<TextPropertyValue>(documents.size());
		for (var value : documents) {
			var valueDocument = asDocument(value, "propertyValues 항목");
			requireConstant(valueDocument, "type", "text");
			values.add(new TextPropertyValue(
					requiredString(valueDocument, "propertyDefinitionId"),
					requiredString(valueDocument, "value")));
		}
		return values;
	}

	private static BlockBody projectBlockBody(Document document) {
		requireConstant(document, "schemaVersion", 1L);
		requireConstant(document, "type", "doc");

		var content = requiredList(document, "content");
		var paragraphs = new ArrayList<ParagraphBlock>(content.size());
		for (var block : content) {
			paragraphs.add(projectParagraph(asDocument(block, "blockBody content 항목")));
		}
		return new BlockBody(paragraphs);
	}

	private static ParagraphBlock projectParagraph(Document document) {
		requireConstant(document, "type", "paragraph");
		var attrs = document.get("attrs");
		if (!(attrs instanceof Map<?, ?> attributes) || !attributes.isEmpty()) {
			throw projectionFailure("paragraph attrs는 빈 객체여야 합니다");
		}

		var textDocuments = requiredList(document, "text");
		var text = new ArrayList<TextSpan>(textDocuments.size());
		for (var span : textDocuments) {
			text.add(new TextSpan(requiredString(asDocument(span, "paragraph text 항목"), "text")));
		}
		return new ParagraphBlock(requiredString(document, "id"), text);
	}

	private static void requireConstant(Document document, String field, String expected) {
		if (!expected.equals(document.get(field))) {
			throw projectionFailure(field + " 값은 " + expected + "이어야 합니다");
		}
	}

	private static void requireConstant(Document document, String field, long expected) {
		if (requiredLong(document, field) != expected) {
			throw projectionFailure(field + " 값은 " + expected + "이어야 합니다");
		}
	}

	private static String requiredString(Document document, String field) {
		var value = document.get(field);
		if (!(value instanceof String stringValue)) {
			throw projectionFailure(field + "는 문자열이어야 합니다");
		}
		return stringValue;
	}

	private static List<?> requiredList(Document document, String field) {
		var value = document.get(field);
		if (!(value instanceof List<?> listValue)) {
			throw projectionFailure(field + "는 배열이어야 합니다");
		}
		return listValue;
	}

	private static Document requiredDocument(Document document, String field) {
		return asDocument(document.get(field), field);
	}

	private static Document asDocument(Object value, String field) {
		if (!(value instanceof Document documentValue)) {
			throw projectionFailure(field + "는 객체여야 합니다");
		}
		return documentValue;
	}

	private static long requiredLong(Document document, String field) {
		var value = document.get(field);
		if (!(value instanceof Byte || value instanceof Short || value instanceof Integer || value instanceof Long)) {
			throw projectionFailure(field + "는 정수여야 합니다");
		}
		return ((Number) value).longValue();
	}

	private static Instant requiredInstant(Document document, String field) {
		var value = document.get(field);
		if (!(value instanceof Date dateValue)) {
			throw projectionFailure(field + "는 날짜여야 합니다");
		}
		return dateValue.toInstant();
	}

	private static IllegalStateException projectionFailure(String reason) {
		return new IllegalStateException("Mongo CareerRecord를 Domain으로 변환할 수 없습니다: " + reason);
	}

}

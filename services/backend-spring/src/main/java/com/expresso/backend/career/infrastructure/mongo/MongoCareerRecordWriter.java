package com.expresso.backend.career.infrastructure.mongo;

import java.util.Date;

import org.bson.Document;

import com.expresso.backend.career.domain.BlockBody;
import com.expresso.backend.career.domain.CareerRecord;
import com.expresso.backend.career.domain.ParagraphBlock;
import com.expresso.backend.career.domain.TextPropertyValue;

final class MongoCareerRecordWriter {

	Document write(CareerRecord record, String idempotencyKey, String requestHash) {
		return new Document("_id", record.id())
				.append("userId", record.ownerId())
				.append("categoryId", record.categoryId())
				.append("title", record.title())
				.append("propertyValues", record.propertyValues().stream()
						.map(MongoCareerRecordWriter::writePropertyValue)
						.toList())
				.append("blockBody", writeBlockBody(record.blockBody()))
				.append("editorSchemaVersion", 1)
				.append("version", record.version())
				.append("updatedAt", Date.from(record.updatedAt()))
				// Fastify 공존 기간의 기존 Mongo validator가 요구하는 최소 호환 필드입니다.
				.append("status", "draft")
				.append("origin", "manual")
				.append("properties", new Document())
				.append("bodyMd", "")
				.append("deletedAt", null)
				.append("purgeAfter", null)
				.append("createIdempotencyKey", idempotencyKey)
				.append("createRequestHash", requestHash);
	}

	private static Document writePropertyValue(TextPropertyValue value) {
		return new Document("propertyDefinitionId", value.propertyDefinitionId())
				.append("type", "text")
				.append("value", value.value());
	}

	private static Document writeBlockBody(BlockBody body) {
		return new Document("schemaVersion", 1)
				.append("type", "doc")
				.append("content", body.paragraphs().stream()
						.map(MongoCareerRecordWriter::writeParagraph)
						.toList());
	}

	private static Document writeParagraph(ParagraphBlock paragraph) {
		return new Document("id", paragraph.id())
				.append("type", "paragraph")
				.append("attrs", new Document())
				.append("text", paragraph.text().stream()
						.map(span -> new Document("text", span.text()))
						.toList());
	}

}

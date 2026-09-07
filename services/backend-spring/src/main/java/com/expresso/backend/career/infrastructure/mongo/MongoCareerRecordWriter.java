package com.expresso.backend.career.infrastructure.mongo;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Map;

import org.bson.Document;
import org.bson.types.Decimal128;

import com.expresso.backend.career.domain.BlockBody;
import com.expresso.backend.career.domain.CareerRecord;
import com.expresso.backend.career.domain.PropertyValue;
import com.expresso.backend.career.domain.PropertyValueType;
import com.expresso.backend.career.domain.SemanticBlock;
import com.expresso.backend.career.domain.TextMark;
import com.expresso.backend.career.domain.TextSpan;
import com.expresso.backend.career.domain.TextualPropertyValue;

final class MongoCareerRecordWriter {

	Document write(CareerRecord record, String idempotencyKey, String requestHash) {
		return new Document("_id", record.id())
				.append("userId", record.ownerId())
				.append("categoryId", record.categoryId())
				.append("title", record.title())
				.append("propertyValues", writePropertyValues(record.propertyValues()))
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

	static List<Document> writePropertyValues(List<PropertyValue> values) {
		return values.stream().map(MongoCareerRecordWriter::writePropertyValue).toList();
	}

	private static Document writePropertyValue(PropertyValue value) {
		var textValue = requireTextPropertyValue(value);
		return new Document("propertyDefinitionId", textValue.propertyDefinitionId())
				.append("type", "text")
				.append("value", textValue.value());
	}

	// Task 6에서 rich BSON mapping으로 교체할 임시 TEXT 전용 경계입니다.
	private static TextualPropertyValue requireTextPropertyValue(PropertyValue value) {
		if (value instanceof TextualPropertyValue textValue && value.type() == PropertyValueType.TEXT) {
			return textValue;
		}
		throw new IllegalStateException("현재 Mongo writer는 text PropertyValue만 지원합니다");
	}

	static Document writeBlockBody(BlockBody body) {
		return new Document("schemaVersion", 1)
				.append("type", "doc")
				.append("content", body.content().stream()
						.map(MongoCareerRecordWriter::writeBlock)
						.toList());
	}

	private static Document writeBlock(SemanticBlock block) {
		return new Document("id", block.id())
				.append("type", block.type())
				.append("attrs", writeJsonObject(block.attrs()))
				.append("content", block.content().stream()
						.map(MongoCareerRecordWriter::writeBlock)
						.toList())
				.append("text", block.text().stream()
						.map(MongoCareerRecordWriter::writeTextSpan)
						.toList());
	}

	private static Document writeTextSpan(TextSpan span) {
		return new Document("text", span.text())
				.append("marks", span.marks().stream()
						.map(MongoCareerRecordWriter::writeTextMark)
						.toList());
	}

	private static Document writeTextMark(TextMark mark) {
		return new Document("type", mark.type())
				.append("attrs", writeJsonObject(mark.attrs()));
	}

	private static Document writeJsonObject(Map<String, Object> value) {
		var document = new Document();
		value.forEach((key, item) -> document.append(key, writeJsonValue(item)));
		return document;
	}

	private static Object writeJsonValue(Object value) {
		if (value == null || value instanceof String || value instanceof Boolean || value instanceof Long) {
			return value;
		}
		if (value instanceof BigDecimal decimal) {
			return new Decimal128(decimal);
		}
		if (value instanceof List<?> list) {
			var values = new ArrayList<>(list.size());
			for (var item : list) values.add(writeJsonValue(item));
			return values;
		}
		if (value instanceof Map<?, ?> map) {
			var document = new Document();
			for (var entry : map.entrySet()) {
				document.append((String) entry.getKey(), writeJsonValue(entry.getValue()));
			}
			return document;
		}
		throw new IllegalArgumentException("MongoDB에 저장할 수 없는 canonical JSON 값입니다");
	}

}

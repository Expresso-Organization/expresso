package com.expresso.backend.career.infrastructure.mongo;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import org.bson.Document;
import org.bson.types.Decimal128;

import com.expresso.backend.career.domain.BlockBody;
import com.expresso.backend.career.domain.AssetPropertyValue;
import com.expresso.backend.career.domain.CareerRecord;
import com.expresso.backend.career.domain.CheckboxPropertyValue;
import com.expresso.backend.career.domain.DatePropertyValue;
import com.expresso.backend.career.domain.MultiSelectPropertyValue;
import com.expresso.backend.career.domain.NumberPropertyValue;
import com.expresso.backend.career.domain.PropertyValue;
import com.expresso.backend.career.domain.SelectPropertyValue;
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
		var document = new Document("propertyDefinitionId", value.propertyDefinitionId())
				.append("type", value.type().wireName());
		if (value instanceof TextualPropertyValue textual) {
			return document.append("value", textual.value());
		}
		if (value instanceof NumberPropertyValue number) {
			return document.append("value", new Decimal128(number.value()));
		}
		if (value instanceof CheckboxPropertyValue checkbox) {
			return document.append("value", checkbox.value());
		}
		if (value instanceof SelectPropertyValue select) {
			return document.append("value", select.value());
		}
		if (value instanceof MultiSelectPropertyValue multiSelect) {
			return document.append("value", multiSelect.value());
		}
		if (value instanceof DatePropertyValue date) {
			var dateValue = new Document("precision", date.precision().name().toLowerCase(Locale.ROOT))
					.append("start", date.start())
					.append("end", date.end());
			if (date.precision() == DatePropertyValue.Precision.DATETIME) {
				dateValue.append("timezone", date.timezone());
			}
			return document.append("value", dateValue);
		}
		if (value instanceof AssetPropertyValue asset) {
			return document.append("value", asset.value());
		}
		throw new IllegalStateException("지원하지 않는 canonical PropertyValue입니다: " + value.getClass().getSimpleName());
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

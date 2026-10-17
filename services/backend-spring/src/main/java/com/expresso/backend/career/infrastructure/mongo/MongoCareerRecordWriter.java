package com.expresso.backend.career.infrastructure.mongo;

import java.util.Date;
import java.util.List;
import java.util.Locale;

import org.bson.Document;
import org.bson.types.Decimal128;

import com.expresso.backend.career.domain.*;

final class MongoCareerRecordWriter {
    // 기존 물리 문서를 교체하지 않고 business 필드만 갱신할 수 있는 매핑입니다.
    Document writeUpdate(CareerRecord record) {
        return new Document("$set", new Document("title", record.title())
                .append("propertyValues", writePropertyValues(record.propertyValues()))
                .append("status", record.status().wireName())
                .append("version", record.version())
                .append("updatedAt", Date.from(record.updatedAt())));
    }

	static List<Document> writePropertyValues(List<PropertyValue> values) {
		return values.stream().map(MongoCareerRecordWriter::writePropertyValue).toList();
	}

	static Document writePropertyValue(PropertyValue value) {
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


}

package com.expresso.backend.career.dto;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;

import com.expresso.backend.career.domain.*;

public record CareerBusinessRecordData(
        String id,
        String userId,
        String categoryId,
        String title,
        List<PropertyValueData> propertyValues,
        String status,
        long version,
        String updatedAt) {

    public static CareerBusinessRecordData from(CareerRecord record) {
        return new CareerBusinessRecordData(record.id(), record.userId(), record.categoryId(), record.title(),
                record.propertyValues().stream().map(PropertyValueData::from).toList(),
                record.status().wireName(), record.version(), record.updatedAt().toString());
    }

    public record Response(CareerBusinessRecordData data) {}

    public record PropertyValueData(String propertyDefinitionId, String type, Object value) {
        static PropertyValueData from(PropertyValue value) {
            Object wireValue = switch (value) {
                case TextualPropertyValue textual -> textual.value();
                case NumberPropertyValue number -> number.value().toPlainString();
                case CheckboxPropertyValue checkbox -> checkbox.value();
                case SelectPropertyValue select -> select.value();
                case MultiSelectPropertyValue multi -> multi.value();
                case AssetPropertyValue asset -> asset.value();
                case DatePropertyValue date -> {
                    var fields = new LinkedHashMap<String, Object>();
                    fields.put("precision", date.precision().name().toLowerCase(Locale.ROOT));
                    fields.put("start", date.start());
                    fields.put("end", date.end());
                    if (date.precision() == DatePropertyValue.Precision.DATETIME) {
                        fields.put("timezone", date.timezone());
                    }
                    yield fields;
                }
            };
            return new PropertyValueData(value.propertyDefinitionId(), value.type().wireName(), wireValue);
        }
    }
}

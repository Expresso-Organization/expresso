package com.expresso.backend.career.domain;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

public final class BusinessRecordFixture {
    private BusinessRecordFixture() {}

    public static String id(int value) {
        return "00000000-0000-4000-8000-%012d".formatted(value);
    }

    public static CareerRecord record() {
        return new CareerRecord(id(1), id(2), id(3), "커리어 기록", values(),
                CareerRecordStatus.ORGANIZED, 7, Instant.parse("2026-10-06T01:02:03Z"));
    }

    public static List<PropertyValue> values() {
        return List.of(
                new TextualPropertyValue(id(11), PropertyValueType.TEXT, "업무 메모 😀"),
                new NumberPropertyValue(id(12), new BigDecimal("12345678901234567890.123400")),
                new CheckboxPropertyValue(id(13), true),
                new SelectPropertyValue(id(14), id(81)),
                new SelectPropertyValue(id(15), null),
                new MultiSelectPropertyValue(id(16), List.of(id(82), id(81))),
                new DatePropertyValue(id(17), DatePropertyValue.Precision.MONTH, "2026-01", "2026-10", null),
                new DatePropertyValue(id(18), DatePropertyValue.Precision.DAY, "2024-02-29", null, null),
                new DatePropertyValue(id(19), DatePropertyValue.Precision.DATETIME,
                        "2026-10-06T10:02:03.123456789+09:00", "2026-10-06T02:02:03Z", "Asia/Seoul"),
                new DatePropertyValue(id(20), DatePropertyValue.Precision.DATETIME,
                        "2026-10-06T01:02:03Z", null, null),
                new TextualPropertyValue(id(21), PropertyValueType.URL, "https://example.com"),
                new TextualPropertyValue(id(22), PropertyValueType.EMAIL, "career@example.com"),
                new TextualPropertyValue(id(23), PropertyValueType.PHONE, "+82-10-1234-5678"),
                new AssetPropertyValue(id(24), PropertyValueType.FILE, List.of(id(91), id(92))),
                new AssetPropertyValue(id(25), PropertyValueType.MEDIA, List.of(id(92))));
    }
}

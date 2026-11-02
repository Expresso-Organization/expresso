package com.expresso.backend.career.application;

import java.time.Instant;
import java.util.List;
import java.util.Objects;
import com.expresso.backend.career.domain.*;

public final class CareerWriterPolicy {
    private CareerWriterPolicy() {}
    public static void validateStatusTransition(CareerRecordStatus from, CareerRecordStatus to) {
        Objects.requireNonNull(from);
        Objects.requireNonNull(to);
    }
    public static CareerRecord advance(CareerRecord record, String categoryId, List<PropertyValue> values, Instant now) {
        if (record.version() == CareerRecord.MAX_VERSION) throw new IllegalStateException("business version 상한입니다");
        return new CareerRecord(record.id(), record.userId(), categoryId, record.title(), values, record.status(),
                Math.addExact(record.version(), 1), now);
    }
}

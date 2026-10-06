package com.expresso.backend.career.application;

import java.util.List;
import java.util.Objects;
import com.expresso.backend.career.domain.*;

public record CreateCareerBusinessCommand(String categoryId, String title, List<PropertyValue> propertyValues, Mode mode) {
    public enum Mode { EMPTY, GROUPED, DUPLICATE }
    public CreateCareerBusinessCommand {
        Objects.requireNonNull(mode);
        propertyValues = List.copyOf(propertyValues);
        // aggregate와 동일한 제목·ID·중복 값 경계를 적용합니다.
        new CareerRecord(categoryId, categoryId, categoryId, title, propertyValues, CareerRecordStatus.DRAFT, 1, java.time.Instant.EPOCH);
        if (mode == Mode.EMPTY && (!title.isEmpty() || !propertyValues.isEmpty())) throw new IllegalArgumentException("빈 생성 입력이 아닙니다");
        if (mode == Mode.GROUPED) {
            if (!title.isEmpty() || propertyValues.size() > 1) throw new IllegalArgumentException("그룹 생성은 값 하나까지 허용됩니다");
            for (var value : propertyValues) {
                if (!(value instanceof SelectPropertyValue select && select.value() != null)
                        && !(value instanceof MultiSelectPropertyValue multi && multi.value().size() == 1)) {
                    throw new IllegalArgumentException("그룹 생성은 select 또는 단일 multi_select 값이어야 합니다");
                }
            }
        }
    }
    public static CreateCareerBusinessCommand empty(String categoryId) {
        return new CreateCareerBusinessCommand(categoryId, "", List.of(), Mode.EMPTY);
    }
}

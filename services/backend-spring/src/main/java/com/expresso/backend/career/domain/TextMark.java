package com.expresso.backend.career.domain;

import java.util.Map;
import java.util.Objects;

public record TextMark(String type, Map<String, Object> attrs) {

	public TextMark {
		Objects.requireNonNull(type, "mark type은 null일 수 없습니다");
		attrs = CanonicalJsonValues.copyObject(attrs);
	}

}

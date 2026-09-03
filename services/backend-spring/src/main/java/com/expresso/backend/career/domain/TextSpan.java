package com.expresso.backend.career.domain;

import java.util.Objects;

public record TextSpan(String text) {

	private static final int MAX_TEXT_LENGTH = 200_000;

	public TextSpan {
		Objects.requireNonNull(text, "text는 null일 수 없습니다");
		var length = text.codePointCount(0, text.length());
		if (length == 0 || length > MAX_TEXT_LENGTH) {
			throw new IllegalArgumentException("text 길이는 1자 이상 200000자 이하여야 합니다");
		}
	}

}

package com.expresso.backend.career.domain;

import java.util.Objects;
import java.util.List;

public record TextSpan(String text, List<TextMark> marks) {

	public TextSpan {
		Objects.requireNonNull(text, "text는 null일 수 없습니다");
		marks = List.copyOf(Objects.requireNonNull(marks, "marks는 null일 수 없습니다"));
	}

}

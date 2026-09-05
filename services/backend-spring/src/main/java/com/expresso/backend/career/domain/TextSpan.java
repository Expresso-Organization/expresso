package com.expresso.backend.career.domain;

import java.util.Objects;
import java.util.List;

public record TextSpan(String text, List<TextMark> marks) {

	public TextSpan {
		Objects.requireNonNull(text, "text는 null일 수 없습니다");
		marks = List.copyOf(Objects.requireNonNull(marks, "marks는 null일 수 없습니다"));
	}

	/** Task 6에서 HTTP mapper를 rich 생성자로 옮긴 뒤 제거할 paragraph-only 호환 생성자입니다. */
	@Deprecated(forRemoval = true)
	public TextSpan(String text) {
		this(text, List.of());
	}

}

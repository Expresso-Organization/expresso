package com.expresso.backend.career.domain;

import java.util.List;
import java.util.Objects;

public record ParagraphBlock(String id, List<TextSpan> text) {

	public ParagraphBlock {
		Objects.requireNonNull(id, "id는 null일 수 없습니다");
		text = List.copyOf(Objects.requireNonNull(text, "text는 null일 수 없습니다"));
	}

}

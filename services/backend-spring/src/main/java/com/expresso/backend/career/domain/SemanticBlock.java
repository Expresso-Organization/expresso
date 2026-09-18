package com.expresso.backend.career.domain;

import java.util.List;
import java.util.Map;
import java.util.Objects;

public record SemanticBlock(
		String id,
		String type,
		Map<String, Object> attrs,
		List<SemanticBlock> content,
		List<TextSpan> text) {

	public SemanticBlock {
		Objects.requireNonNull(id, "block id는 null일 수 없습니다");
		Objects.requireNonNull(type, "block type은 null일 수 없습니다");
		attrs = CanonicalJsonValues.copyObject(attrs);
		content = List.copyOf(Objects.requireNonNull(content, "block content는 null일 수 없습니다"));
		text = List.copyOf(Objects.requireNonNull(text, "block text는 null일 수 없습니다"));
	}

}

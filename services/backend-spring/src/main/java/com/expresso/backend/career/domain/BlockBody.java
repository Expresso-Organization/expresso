package com.expresso.backend.career.domain;

import java.util.List;
import java.util.Objects;

public record BlockBody(List<ParagraphBlock> paragraphs) {

	public BlockBody {
		paragraphs = List.copyOf(Objects.requireNonNull(paragraphs, "paragraphs는 null일 수 없습니다"));
		if (paragraphs.isEmpty()) {
			throw new IllegalArgumentException("blockBody에는 최소 하나의 paragraph가 필요합니다");
		}
	}

	public static BlockBody empty(String paragraphId) {
		return new BlockBody(List.of(new ParagraphBlock(paragraphId, List.of())));
	}

}

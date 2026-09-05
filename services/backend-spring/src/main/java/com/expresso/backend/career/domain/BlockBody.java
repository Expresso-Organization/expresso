package com.expresso.backend.career.domain;

import java.util.List;
import java.util.Objects;

public record BlockBody(List<SemanticBlock> content) {

	public BlockBody {
		content = List.copyOf(Objects.requireNonNull(content, "content는 null일 수 없습니다"));
		BlockBodyValidator.validate(content);
	}

	public static BlockBody empty(String paragraphId) {
		return new BlockBody(List.of(new SemanticBlock(
				paragraphId, "paragraph", java.util.Map.of(), List.of(), List.of())));
	}

}

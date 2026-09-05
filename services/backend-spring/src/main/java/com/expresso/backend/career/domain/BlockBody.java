package com.expresso.backend.career.domain;

import java.util.Collection;
import java.util.List;
import java.util.Objects;

public record BlockBody(List<SemanticBlock> content) {

	public BlockBody {
		content = List.copyOf(Objects.requireNonNull(content, "content는 null일 수 없습니다"));
		BlockBodyValidator.validate(content);
	}

	/** Task 5와 6에서 Mongo/API mapper를 rich 모델로 옮긴 뒤 제거할 paragraph-only 호환 생성자입니다. */
	@Deprecated(forRemoval = true)
	public BlockBody(Collection<ParagraphBlock> paragraphs) {
		this(List.copyOf(Objects.requireNonNull(paragraphs, "paragraphs는 null일 수 없습니다")).stream()
				.map(BlockBody::fromParagraph)
				.toList());
	}

	public static BlockBody empty(String paragraphId) {
		return new BlockBody(List.of(new SemanticBlock(
				paragraphId, "paragraph", java.util.Map.of(), List.of(), List.of())));
	}

	/** Task 5와 6에서 Mongo/API mapper를 rich 모델로 옮긴 뒤 제거할 paragraph-only 호환 접근자입니다. */
	@Deprecated(forRemoval = true)
	public List<ParagraphBlock> paragraphs() {
		return content.stream().map(BlockBody::toParagraph).toList();
	}

	private static SemanticBlock fromParagraph(ParagraphBlock paragraph) {
		Objects.requireNonNull(paragraph, "paragraph는 null일 수 없습니다");
		return new SemanticBlock(paragraph.id(), "paragraph", java.util.Map.of(), List.of(), paragraph.text());
	}

	private static ParagraphBlock toParagraph(SemanticBlock block) {
		if (!block.type().equals("paragraph") || !block.attrs().isEmpty() || !block.content().isEmpty()
				|| block.text().stream().anyMatch(span -> !span.marks().isEmpty())) {
			throw new IllegalStateException("rich blockBody는 paragraph-only 호환 형태로 변환할 수 없습니다");
		}
		return new ParagraphBlock(block.id(), block.text());
	}

}

package com.expresso.backend.career.domain;

import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

final class BlockBodyValidator {

	private static final int MAX_DEPTH = 32;
	private static final int MAX_BLOCKS = 20_000;
	private static final int MAX_ATTRS_DEPTH = 16;
	private static final int MAX_BLOCK_ATTRS_BYTES = 65_536;
	private static final int MAX_MARK_ATTRS_BYTES = 8_192;
	private static final int MAX_TEXT_CODE_POINTS = 200_000;
	private static final int MAX_MARKS = 20;
	private static final int MAX_DOCUMENT_BYTES = 4_194_304;
	private static final Pattern UUID_PATTERN = Pattern.compile(
			"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$");
	private static final Pattern BLOCK_TYPE_PATTERN = Pattern.compile("^[a-z][a-zA-Z0-9_.-]{0,63}$");
	private static final Set<String> MARK_TYPES = Set.of("bold", "italic", "strike", "code", "link");
	private static final Set<String> KNOWN_BLOCK_TYPES = Set.of(
			"paragraph", "heading1", "heading2", "heading3", "bulletList", "orderedList", "taskList",
			"listItem", "blockquote", "code", "callout", "horizontalRule", "image", "file", "table",
			"tableRow", "tableCell", "evidence");

	private BlockBodyValidator() {
	}

	static void validate(List<SemanticBlock> content) {
		var state = new ValidationState();
		for (var block : content) {
			visit(block, 1, state);
		}
		if (CanonicalJsonUtf8Size.blockBodyExceeds(content, MAX_DOCUMENT_BYTES)) {
			throw new IllegalArgumentException("blockBody는 compact UTF-8 JSON 기준 4194304 bytes를 초과할 수 없습니다");
		}
	}

	private static void visit(SemanticBlock block, int depth, ValidationState state) {
		if (depth > MAX_DEPTH) {
			throw new IllegalArgumentException("blockBody의 중첩 깊이는 32를 초과할 수 없습니다");
		}
		state.blockCount++;
		if (state.blockCount > MAX_BLOCKS) {
			throw new IllegalArgumentException("blockBody에는 최대 20000개의 block까지 허용됩니다");
		}
		if (!UUID_PATTERN.matcher(block.id()).matches()) {
			throw new IllegalArgumentException("block id는 UUID 형식이어야 합니다");
		}
		if (!state.blockIds.add(block.id())) {
			throw new IllegalArgumentException("문서 전체에서 같은 block id를 중복해서 사용할 수 없습니다");
		}
		if (!BLOCK_TYPE_PATTERN.matcher(block.type()).matches()) {
			throw new IllegalArgumentException("block type 형식이 올바르지 않습니다");
		}
		validateAttrs(block.attrs(), MAX_BLOCK_ATTRS_BYTES, "block attrs");
		for (var span : block.text()) {
			validateTextSpan(span);
		}
		validateKnownBlock(block);
		for (var child : block.content()) {
			visit(child, depth + 1, state);
		}
	}

	private static void validateTextSpan(TextSpan span) {
		if (span.text().codePointCount(0, span.text().length()) > MAX_TEXT_CODE_POINTS) {
			throw new IllegalArgumentException("text는 200000자를 초과할 수 없습니다");
		}
		if (span.marks().size() > MAX_MARKS) {
			throw new IllegalArgumentException("하나의 text span에는 최대 20개의 mark까지 허용됩니다");
		}
		for (var mark : span.marks()) {
			if (!MARK_TYPES.contains(mark.type())) {
				throw new IllegalArgumentException("지원하지 않는 mark type입니다: " + mark.type());
			}
			validateAttrs(mark.attrs(), MAX_MARK_ATTRS_BYTES, "mark attrs");
			if (mark.type().equals("link") && !isNonEmptyString(mark.attrs().get("href"))) {
				throw new IllegalArgumentException("link mark에는 비어 있지 않은 href가 필요합니다");
			}
		}
	}

	private static void validateAttrs(Map<String, Object> attrs, int byteLimit, String name) {
		if (jsonDepth(attrs) > MAX_ATTRS_DEPTH) {
			throw new IllegalArgumentException(name + "의 JSON 깊이는 16을 초과할 수 없습니다");
		}
		if (CanonicalJsonUtf8Size.jsonValueBytes(attrs) > byteLimit) {
			throw new IllegalArgumentException(name + "의 compact UTF-8 JSON 크기 제한을 초과했습니다");
		}
	}

	private static int jsonDepth(Object value) {
		if (value instanceof Map<?, ?> map) {
			var maximum = 0;
			for (var child : map.values()) maximum = Math.max(maximum, jsonDepth(child));
			return 1 + maximum;
		}
		if (value instanceof List<?> list) {
			var maximum = 0;
			for (var child : list) maximum = Math.max(maximum, jsonDepth(child));
			return 1 + maximum;
		}
		return 0;
	}

	private static void validateKnownBlock(SemanticBlock block) {
		if (!KNOWN_BLOCK_TYPES.contains(block.type())) return;
		if (block.attrs().containsKey("sourceMarkdown") && !(block.attrs().get("sourceMarkdown") instanceof String)) {
			throw new IllegalArgumentException(block.type() + " block의 sourceMarkdown는 문자열이어야 합니다");
		}
		switch (block.type()) {
			case "paragraph", "heading1", "heading2", "heading3" -> requireEmptyContent(block);
			case "code" -> {
				requireEmptyContent(block);
				var language = block.attrs().get("language");
				if (block.attrs().containsKey("language") && language != null && !(language instanceof String)) {
					throw new IllegalArgumentException("code block의 language는 문자열 또는 null이어야 합니다");
				}
			}
			case "bulletList", "orderedList", "taskList" -> {
				requireEmptyText(block);
				requireChildren(block, "listItem");
			}
			case "listItem" -> {
				requireExclusiveContentOrText(block);
				if (block.attrs().containsKey("checked") && !(block.attrs().get("checked") instanceof Boolean)) {
					throw new IllegalArgumentException("listItem block의 checked는 boolean이어야 합니다");
				}
			}
			case "blockquote", "callout" -> {
				requireExclusiveContentOrText(block);
				if (block.attrs().containsKey("icon") && !(block.attrs().get("icon") instanceof String)) {
					throw new IllegalArgumentException(block.type() + " block의 icon은 문자열이어야 합니다");
				}
			}
			case "horizontalRule" -> {
				requireEmptyContent(block);
				requireEmptyText(block);
			}
			case "image" -> {
				requireEmptyContent(block);
				requireEmptyText(block);
				requireNonEmptyStringAttr(block, "mediaId");
				if (block.attrs().containsKey("alt") && !(block.attrs().get("alt") instanceof String)) {
					throw new IllegalArgumentException("image block의 alt는 문자열이어야 합니다");
				}
			}
			case "file" -> {
				requireEmptyContent(block);
				requireEmptyText(block);
				requireNonEmptyStringAttr(block, "mediaId");
				if (!(block.attrs().get("name") instanceof String)) {
					throw new IllegalArgumentException("file block에는 문자열 name이 필요합니다");
				}
			}
			case "table" -> {
				requireEmptyText(block);
				requireChildren(block, "tableRow");
			}
			case "tableRow" -> {
				requireEmptyText(block);
				requireChildren(block, "tableCell");
			}
			case "tableCell" -> requireExclusiveContentOrText(block);
			case "evidence" -> {
				requireEmptyContent(block);
				requireNonEmptyStringAttr(block, "source");
			}
			default -> throw new IllegalStateException("known block 검증 규칙이 누락되었습니다: " + block.type());
		}
	}

	private static void requireEmptyContent(SemanticBlock block) {
		if (!block.content().isEmpty()) {
			throw new IllegalArgumentException(block.type() + " block은 중첩 content를 가질 수 없습니다");
		}
	}

	private static void requireEmptyText(SemanticBlock block) {
		if (!block.text().isEmpty()) {
			throw new IllegalArgumentException(block.type() + " block은 직접 text를 가질 수 없습니다");
		}
	}

	private static void requireExclusiveContentOrText(SemanticBlock block) {
		if (!block.content().isEmpty() && !block.text().isEmpty()) {
			throw new IllegalArgumentException(block.type() + " block은 non-empty content와 text를 함께 가질 수 없습니다");
		}
	}

	private static void requireChildren(SemanticBlock block, String childType) {
		if (block.content().stream().anyMatch(child -> !child.type().equals(childType))) {
			throw new IllegalArgumentException(block.type() + " block의 자식은 모두 " + childType + "이어야 합니다");
		}
	}

	private static void requireNonEmptyStringAttr(SemanticBlock block, String name) {
		if (!isNonEmptyString(block.attrs().get(name))) {
			throw new IllegalArgumentException(block.type() + " block에는 비어 있지 않은 " + name + "가 필요합니다");
		}
	}

	private static boolean isNonEmptyString(Object value) {
		return value instanceof String string && !string.isEmpty();
	}

	private static final class ValidationState {
		private final Set<String> blockIds = new HashSet<>();
		private int blockCount;
	}

}

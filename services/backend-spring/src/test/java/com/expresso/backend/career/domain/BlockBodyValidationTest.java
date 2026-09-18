package com.expresso.backend.career.domain;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.math.BigDecimal;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.IntStream;

import org.junit.jupiter.api.Test;

import tools.jackson.databind.ObjectMapper;

class BlockBodyValidationTest {

	private static final String BLOCK_ID = "50000000-0000-4000-8000-000000000001";
	private static final String CHILD_ID = "50000000-0000-4000-8000-000000000002";
	private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

	@Test
	void acceptsAndPreservesTheSharedRichCorpus() throws IOException {
		var fixturePath = Path.of("..", "..", "packages", "contracts", "openapi", "fixtures",
				"career-rich-block-body-v1.json");
		@SuppressWarnings("unchecked")
		var fixtures = (Map<String, Object>) OBJECT_MAPPER.readValue(Files.readAllBytes(fixturePath), Map.class);

		var paragraph = readBody(asMap(fixtures.get("paragraphOnly")));
		var emptyRoot = readBody(asMap(fixtures.get("emptyRoot")));
		var rich = readBody(asMap(fixtures.get("richNested")));
		var unknown = readBody(asMap(fixtures.get("unknownBlock")));

		assertEquals("paragraph", paragraph.content().getFirst().type());
		assertTrue(emptyRoot.content().isEmpty());
		assertEquals("bold", rich.content().getFirst().text().getFirst().marks().getFirst().type());
		assertEquals("tableCell", rich.content().get(2).content().getFirst().content().getFirst().type());
		assertEquals("future.timeline", unknown.content().getFirst().type());
		assertNull(unknown.content().getFirst().attrs().get("nullable"));
		assertEquals(new BigDecimal("1.5"), unknown.content().getFirst().attrs().get("scale"));
		assertEquals("미래 블록의 직접 본문", unknown.content().getFirst().text().getFirst().text());
	}

	@Test
	void defensivelyCopiesNestedAttrsContentTextAndMarks() {
		var nestedList = new ArrayList<Object>(List.of("처음"));
		var nestedObject = new LinkedHashMap<String, Object>();
		nestedObject.put("nullable", null);
		nestedObject.put("values", nestedList);
		var attrs = new LinkedHashMap<String, Object>();
		attrs.put("nested", nestedObject);
		var markAttrs = new LinkedHashMap<String, Object>();
		markAttrs.put("href", "https://example.com");
		var marks = new ArrayList<>(List.of(new TextMark("link", markAttrs)));
		var text = new ArrayList<>(List.of(new TextSpan("링크", marks)));
		var children = new ArrayList<>(List.of(paragraph(CHILD_ID, List.of())));

		var body = new BlockBody(List.of(new SemanticBlock(
				BLOCK_ID, "future.container", attrs, children, text)));
		nestedList.add("변경");
		nestedObject.put("added", true);
		markAttrs.put("target", "_blank");
		marks.clear();
		text.clear();
		children.clear();

		var block = body.content().getFirst();
		var copiedNested = asMap(block.attrs().get("nested"));
		assertNull(copiedNested.get("nullable"));
		assertEquals(List.of("처음"), copiedNested.get("values"));
		assertEquals(Map.of("href", "https://example.com"), block.text().getFirst().marks().getFirst().attrs());
		assertEquals(1, block.content().size());
		assertThrows(UnsupportedOperationException.class, () -> body.content().clear());
		assertThrows(UnsupportedOperationException.class, () -> block.attrs().put("new", true));
		assertThrows(UnsupportedOperationException.class, () -> asList(copiedNested.get("values")).add("new"));
	}

	@Test
	void acceptsEmptyRootEmptyTextAndTwoHundredThousandCodePoints() {
		assertTrue(new BlockBody(List.<SemanticBlock>of()).content().isEmpty());
		var maximum = new TextSpan("😀".repeat(200_000), List.of());
		assertEquals(200_000, maximum.text().codePointCount(0, maximum.text().length()));
		assertEquals("", new TextSpan("", List.of()).text());
		assertThrows(IllegalArgumentException.class,
				() -> new BlockBody(List.of(paragraph(BLOCK_ID, List.of(new TextSpan("😀".repeat(200_001), List.of()))))));
	}

	@Test
	void validatesBlockIdentityTypeAndMarkCount() {
		assertThrows(IllegalArgumentException.class, () -> new BlockBody(List.of(block(
				"not-a-uuid", "paragraph", Map.of(), List.of(), List.of()))));
		assertThrows(IllegalArgumentException.class, () -> new BlockBody(List.of(block(
				BLOCK_ID, "Heading 1", Map.of(), List.of(), List.of()))));
		var twentyMarks = IntStream.range(0, 20).mapToObj(index -> new TextMark("bold", Map.of())).toList();
		new BlockBody(List.of(paragraph(BLOCK_ID, List.of(new TextSpan("본문", twentyMarks)))));
		var twentyOneMarks = new ArrayList<>(twentyMarks);
		twentyOneMarks.add(new TextMark("italic", Map.of()));
		assertThrows(IllegalArgumentException.class, () -> new BlockBody(List.of(
				paragraph(BLOCK_ID, List.of(new TextSpan("본문", twentyOneMarks))))));
	}

	@Test
	void rejectsNonJsonAndNonFiniteAttrsValues() {
		assertThrows(IllegalArgumentException.class, () -> block(
				"future.block", Map.of("unsupported", Path.of("file")), List.of(), List.of()));
		assertThrows(IllegalArgumentException.class, () -> block(
				"future.block", Map.of("notFinite", Double.NaN), List.of(), List.of()));
	}

	@Test
	void rejectsDuplicateIdsAcrossDifferentDepths() {
		var nested = new SemanticBlock(CHILD_ID, "future.container", Map.of(),
				List.of(paragraph(BLOCK_ID, List.of())), List.of());
		assertThrows(IllegalArgumentException.class,
				() -> new BlockBody(List.of(paragraph(BLOCK_ID, List.of()), nested)));
	}

	@Test
	void acceptsDepthThirtyTwoAndRejectsDepthThirtyThree() {
		var depthThirtyTwo = nestedUnknownBlock(32);
		new BlockBody(List.of(depthThirtyTwo));
		assertThrows(IllegalArgumentException.class, () -> new BlockBody(List.of(nestedUnknownBlock(33))));
	}

	@Test
	void acceptsTwentyThousandBlocksAndRejectsOneMore() {
		var maximum = IntStream.range(0, 20_000).mapToObj(BlockBodyValidationTest::paragraph).toList();
		new BlockBody(maximum);
		var overLimit = new ArrayList<>(maximum);
		overLimit.add(paragraph(20_000));
		assertThrows(IllegalArgumentException.class, () -> new BlockBody(overLimit));
	}

	@Test
	void enforcesAttrsDepthAndCompactUtf8ByteLimits() {
		new BlockBody(List.of(block("future.block", nestedObject(16), List.of(), List.of())));
		assertThrows(IllegalArgumentException.class,
				() -> new BlockBody(List.of(block("future.block", nestedObject(17), List.of(), List.of()))));

		new BlockBody(List.of(block("future.block", Map.of("value", "x".repeat(65_524)), List.of(), List.of())));
		assertThrows(IllegalArgumentException.class, () -> new BlockBody(List.of(block(
				"future.block", Map.of("value", "x".repeat(65_525)), List.of(), List.of()))));

		var maximumMark = new TextMark("bold", Map.of("value", "x".repeat(8_180)));
		new BlockBody(List.of(paragraph(BLOCK_ID, List.of(new TextSpan("본문", List.of(maximumMark))))));
		var deeplyNestedMark = new TextMark("bold", nestedObject(17));
		assertThrows(IllegalArgumentException.class, () -> new BlockBody(List.of(
				paragraph(BLOCK_ID, List.of(new TextSpan("본문", List.of(deeplyNestedMark)))))));
		var oversizedMark = new TextMark("bold", Map.of("value", "x".repeat(8_181)));
		assertThrows(IllegalArgumentException.class, () -> new BlockBody(List.of(
				paragraph(BLOCK_ID, List.of(new TextSpan("본문", List.of(oversizedMark)))))));
	}

	@Test
	void rejectsACompactDocumentLargerThanFourMib() {
		var text = IntStream.range(0, 29)
				.mapToObj(index -> new TextSpan("가".repeat(49_000), List.of()))
				.toList();
		assertThrows(IllegalArgumentException.class, () -> new BlockBody(List.of(paragraph(BLOCK_ID, text))));
	}

	@Test
	void validatesKnownBlocksButKeepsUnknownBlocksOpen() {
		var child = paragraph(CHILD_ID, List.of());
		var invalidKnownBlocks = List.of(
				block("paragraph", Map.of(), List.of(child), List.of()),
				block("code", Map.of("language", 1L), List.of(), List.of()),
				block("bulletList", Map.of(), List.of(), List.of(new TextSpan("본문", List.of()))),
				block("orderedList", Map.of(), List.of(child), List.of()),
				block("listItem", Map.of("checked", "yes"), List.of(), List.of()),
				block("callout", Map.of("icon", 1L), List.of(), List.of()),
				block("horizontalRule", Map.of(), List.of(), List.of(new TextSpan("본문", List.of()))),
				block("image", Map.of(), List.of(), List.of()),
				block("file", Map.of("mediaId", "media-1"), List.of(), List.of()),
				block("table", Map.of(), List.of(child), List.of()),
				block("tableRow", Map.of(), List.of(child), List.of()),
				block("tableCell", Map.of(), List.of(child), List.of(new TextSpan("본문", List.of()))),
				block("evidence", Map.of(), List.of(), List.of()),
				block("paragraph", Map.of("sourceMarkdown", 1L), List.of(), List.of()),
				paragraph(BLOCK_ID, List.of(new TextSpan("링크", List.of(new TextMark("link", Map.of()))))));
		for (var invalid : invalidKnownBlocks) {
			assertThrows(IllegalArgumentException.class, () -> new BlockBody(List.of(invalid)));
		}

		var unknown = block("future.timeline", Map.of("arbitrary", List.of(true, 1L)),
				List.of(child), List.of(new TextSpan("직접 본문", List.of())));
		assertEquals(unknown, new BlockBody(List.of(unknown)).content().getFirst());
	}

	@Test
	void calculatesTheSameCompactUtf8BytesAsJackson() throws IOException {
		var attrs = new LinkedHashMap<String, Object>();
		attrs.put("escaped", "줄바꿈\n따옴표\"");
		attrs.put("unicode", "가😀" + new String(Character.toChars(0x1D800)));
		attrs.put("integer", 42L);
		attrs.put("decimal", new BigDecimal("1.5"));
		attrs.put("nullable", null);
		attrs.put("array", List.of(true, "값"));
		assertEquals(OBJECT_MAPPER.writeValueAsBytes(attrs).length, CanonicalJsonUtf8Size.jsonValueBytes(attrs));

		var body = new BlockBody(List.of(block("paragraph", attrs, List.of(),
				List.of(new TextSpan("본문", List.of(new TextMark("bold", Map.of())))))));
		var expectedBlock = new LinkedHashMap<String, Object>();
		expectedBlock.put("id", BLOCK_ID);
		expectedBlock.put("type", "paragraph");
		expectedBlock.put("attrs", attrs);
		expectedBlock.put("content", List.of());
		expectedBlock.put("text", List.of(Map.of("text", "본문", "marks", List.of(Map.of("type", "bold", "attrs", Map.of())))));
		var expectedDocument = Map.of("schemaVersion", 1L, "type", "doc", "content", List.of(expectedBlock));
		assertEquals(OBJECT_MAPPER.writeValueAsBytes(expectedDocument).length, CanonicalJsonUtf8Size.blockBodyBytes(body));
	}

	private static SemanticBlock nestedUnknownBlock(int depth) {
		var current = block(blockId(depth), "future.container", Map.of(), List.of(), List.of());
		for (var currentDepth = depth - 1; currentDepth >= 1; currentDepth--) {
			current = block(blockId(currentDepth), "future.container", Map.of(), List.of(current), List.of());
		}
		return current;
	}

	private static Map<String, Object> nestedObject(int depth) {
		Map<String, Object> value = new LinkedHashMap<>();
		for (var currentDepth = 1; currentDepth < depth; currentDepth++) {
			value = new LinkedHashMap<>(Map.of("nested", value));
		}
		return value;
	}

	private static SemanticBlock paragraph(int index) {
		return paragraph(blockId(index), List.of());
	}

	private static String blockId(int index) {
		return "00000000-0000-4000-8000-%012d".formatted(index);
	}

	private static SemanticBlock paragraph(String id, List<TextSpan> text) {
		return block(id, "paragraph", Map.of(), List.of(), text);
	}

	private static SemanticBlock block(
			String type, Map<String, Object> attrs, List<SemanticBlock> content, List<TextSpan> text) {
		return block(BLOCK_ID, type, attrs, content, text);
	}

	private static SemanticBlock block(
			String id, String type, Map<String, Object> attrs, List<SemanticBlock> content, List<TextSpan> text) {
		return new SemanticBlock(id, type, attrs, content, text);
	}

	@SuppressWarnings("unchecked")
	private static Map<String, Object> asMap(Object value) {
		return (Map<String, Object>) value;
	}

	@SuppressWarnings("unchecked")
	private static List<Object> asList(Object value) {
		return (List<Object>) value;
	}

	private static BlockBody readBody(Map<String, Object> value) {
		return new BlockBody(asList(value.get("content")).stream()
				.map(item -> readBlock(asMap(item)))
				.toList());
	}

	private static SemanticBlock readBlock(Map<String, Object> value) {
		var content = value.containsKey("content")
				? asList(value.get("content")).stream().map(item -> readBlock(asMap(item))).toList()
				: List.<SemanticBlock>of();
		var text = value.containsKey("text")
				? asList(value.get("text")).stream().map(item -> readTextSpan(asMap(item))).toList()
				: List.<TextSpan>of();
		return new SemanticBlock(
				(String) value.get("id"), (String) value.get("type"), asMap(value.get("attrs")), content, text);
	}

	private static TextSpan readTextSpan(Map<String, Object> value) {
		var marks = value.containsKey("marks")
				? asList(value.get("marks")).stream().map(item -> readMark(asMap(item))).toList()
				: List.<TextMark>of();
		return new TextSpan((String) value.get("text"), marks);
	}

	private static TextMark readMark(Map<String, Object> value) {
		var attrs = value.containsKey("attrs") ? asMap(value.get("attrs")) : Map.<String, Object>of();
		return new TextMark((String) value.get("type"), attrs);
	}

}

package com.expresso.backend.career.domain;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

final class CanonicalJsonUtf8Size {

	private CanonicalJsonUtf8Size() {
	}

	static long jsonValueBytes(Object value) {
		var counter = new ByteCounter(Long.MAX_VALUE);
		writeJsonValue(value, counter);
		return counter.size();
	}

	static long blockBodyBytes(BlockBody body) {
		var counter = new ByteCounter(Long.MAX_VALUE);
		writeBlockBody(body.content(), counter);
		return counter.size();
	}

	static boolean blockBodyExceeds(List<SemanticBlock> content, long limit) {
		try {
			writeBlockBody(content, new ByteCounter(limit));
			return false;
		}
		catch (SizeLimitExceeded exception) {
			return true;
		}
	}

	private static void writeBlockBody(List<SemanticBlock> content, ByteCounter counter) {
		counter.ascii("{\"schemaVersion\":1,\"type\":\"doc\",\"content\":");
		writeBlocks(content, counter);
		counter.ascii("}");
	}

	private static void writeBlocks(List<SemanticBlock> blocks, ByteCounter counter) {
		counter.ascii("[");
		for (var index = 0; index < blocks.size(); index++) {
			if (index > 0) counter.ascii(",");
			writeBlock(blocks.get(index), counter);
		}
		counter.ascii("]");
	}

	private static void writeBlock(SemanticBlock block, ByteCounter counter) {
		counter.ascii("{\"id\":");
		writeString(block.id(), counter);
		counter.ascii(",\"type\":");
		writeString(block.type(), counter);
		counter.ascii(",\"attrs\":");
		writeJsonValue(block.attrs(), counter);
		counter.ascii(",\"content\":");
		writeBlocks(block.content(), counter);
		counter.ascii(",\"text\":[");
		for (var index = 0; index < block.text().size(); index++) {
			if (index > 0) counter.ascii(",");
			writeTextSpan(block.text().get(index), counter);
		}
		counter.ascii("]}");
	}

	private static void writeTextSpan(TextSpan span, ByteCounter counter) {
		counter.ascii("{\"text\":");
		writeString(span.text(), counter);
		counter.ascii(",\"marks\":[");
		for (var index = 0; index < span.marks().size(); index++) {
			if (index > 0) counter.ascii(",");
			writeMark(span.marks().get(index), counter);
		}
		counter.ascii("]}");
	}

	private static void writeMark(TextMark mark, ByteCounter counter) {
		counter.ascii("{\"type\":");
		writeString(mark.type(), counter);
		counter.ascii(",\"attrs\":");
		writeJsonValue(mark.attrs(), counter);
		counter.ascii("}");
	}

	private static void writeJsonValue(Object value, ByteCounter counter) {
		if (value == null) {
			counter.ascii("null");
		}
		else if (value instanceof String string) {
			writeString(string, counter);
		}
		else if (value instanceof Boolean bool) {
			counter.ascii(bool ? "true" : "false");
		}
		else if (value instanceof Long integer) {
			counter.ascii(integer.toString());
		}
		else if (value instanceof BigDecimal decimal) {
			counter.ascii(decimal.toPlainString());
		}
		else if (value instanceof List<?> list) {
			counter.ascii("[");
			for (var index = 0; index < list.size(); index++) {
				if (index > 0) counter.ascii(",");
				writeJsonValue(list.get(index), counter);
			}
			counter.ascii("]");
		}
		else if (value instanceof Map<?, ?> map) {
			counter.ascii("{");
			var index = 0;
			for (var entry : map.entrySet()) {
				if (index++ > 0) counter.ascii(",");
				writeString((String) entry.getKey(), counter);
				counter.ascii(":");
				writeJsonValue(entry.getValue(), counter);
			}
			counter.ascii("}");
		}
		else {
			throw new IllegalArgumentException("정규화되지 않은 JSON 값입니다");
		}
	}

	private static void writeString(String value, ByteCounter counter) {
		counter.ascii("\"");
		for (var offset = 0; offset < value.length();) {
			var codePoint = value.codePointAt(offset);
			offset += Character.charCount(codePoint);
			switch (codePoint) {
				case '"', '\\', '\b', '\f', '\n', '\r', '\t' -> counter.add(2);
				default -> {
					if (codePoint < 0x20
							|| codePoint <= Character.MAX_VALUE && Character.isSurrogate((char) codePoint)) counter.add(6);
					else if (codePoint <= 0x7f) counter.add(1);
					else if (codePoint <= 0x7ff) counter.add(2);
					else if (codePoint <= 0xffff) counter.add(3);
					else counter.add(4);
				}
			}
		}
		counter.ascii("\"");
	}

	private static final class ByteCounter {
		private final long limit;
		private long size;

		private ByteCounter(long limit) {
			this.limit = limit;
		}

		void ascii(String value) {
			add(value.length());
		}

		void add(long bytes) {
			size = Math.addExact(size, bytes);
			if (size > limit) throw SizeLimitExceeded.INSTANCE;
		}

		long size() {
			return size;
		}
	}

	private static final class SizeLimitExceeded extends RuntimeException {
		private static final SizeLimitExceeded INSTANCE = new SizeLimitExceeded();

		private SizeLimitExceeded() {
			super(null, null, false, false);
		}
	}

}

package com.expresso.backend.career.domain;

import java.math.BigDecimal;
import java.math.BigInteger;
import java.util.ArrayList;
import java.util.Collections;
import java.util.IdentityHashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

final class CanonicalJsonValues {

	private CanonicalJsonValues() {
	}

	static Map<String, Object> copyObject(Map<String, Object> source) {
		Objects.requireNonNull(source, "JSON object는 null일 수 없습니다");
		return copyObject(source, new IdentityHashMap<>());
	}

	static Object copyValue(Object value) {
		return copyValue(value, new IdentityHashMap<>());
	}

	private static Object copyValue(Object value, IdentityHashMap<Object, Boolean> visiting) {
		if (value == null || value instanceof String || value instanceof Boolean) {
			return value;
		}
		if (value instanceof Number number) {
			return normalizeNumber(number);
		}
		if (value instanceof List<?> list) {
			enterContainer(list, visiting);
			try {
				var copy = new ArrayList<>(list.size());
				for (var item : list) {
					copy.add(copyValue(item, visiting));
				}
				return Collections.unmodifiableList(copy);
			}
			finally {
				visiting.remove(list);
			}
		}
		if (value instanceof Map<?, ?> map) {
			return copyObject(map, visiting);
		}
		throw new IllegalArgumentException("attrs에는 JSON으로 표현할 수 있는 값만 사용할 수 있습니다");
	}

	private static Map<String, Object> copyObject(
			Map<?, ?> source, IdentityHashMap<Object, Boolean> visiting) {
		enterContainer(source, visiting);
		try {
			var copy = new LinkedHashMap<String, Object>();
			for (var entry : source.entrySet()) {
				if (!(entry.getKey() instanceof String key)) {
					throw new IllegalArgumentException("attrs의 모든 key는 문자열이어야 합니다");
				}
				copy.put(key, copyValue(entry.getValue(), visiting));
			}
			return Collections.unmodifiableMap(copy);
		}
		finally {
			visiting.remove(source);
		}
	}

	private static void enterContainer(Object value, IdentityHashMap<Object, Boolean> visiting) {
		if (visiting.put(value, Boolean.TRUE) != null) {
			throw new IllegalArgumentException("attrs에는 순환 참조를 사용할 수 없습니다");
		}
	}

	private static Number normalizeNumber(Number number) {
		if (number instanceof Byte || number instanceof Short || number instanceof Integer || number instanceof Long) {
			return number.longValue();
		}
		if (number instanceof BigInteger integer) {
			try {
				return integer.longValueExact();
			}
			catch (ArithmeticException exception) {
				throw new IllegalArgumentException("JSON 정수는 64비트 범위를 벗어날 수 없습니다", exception);
			}
		}
		if (number instanceof Float floating) {
			if (!Float.isFinite(floating)) {
				throw new IllegalArgumentException("JSON 숫자는 유한한 값이어야 합니다");
			}
			return normalizeDecimal(BigDecimal.valueOf(floating.doubleValue()));
		}
		if (number instanceof Double floating) {
			if (!Double.isFinite(floating)) {
				throw new IllegalArgumentException("JSON 숫자는 유한한 값이어야 합니다");
			}
			return normalizeDecimal(BigDecimal.valueOf(floating));
		}
		if (number instanceof BigDecimal decimal) {
			return normalizeDecimal(decimal);
		}
		throw new IllegalArgumentException("지원하지 않는 JSON 숫자 타입입니다: " + number.getClass().getSimpleName());
	}

	private static BigDecimal normalizeDecimal(BigDecimal decimal) {
		var normalized = decimal.stripTrailingZeros();
		return normalized.scale() < 0 ? normalized.setScale(0) : normalized;
	}

}

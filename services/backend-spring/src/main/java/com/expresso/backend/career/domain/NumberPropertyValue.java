package com.expresso.backend.career.domain;

import java.math.BigDecimal;
import java.math.MathContext;
import java.math.RoundingMode;
import java.util.Objects;

public record NumberPropertyValue(String propertyDefinitionId, BigDecimal value) implements PropertyValue {
	private static final MathContext EXACT_DECIMAL128 = new MathContext(34, RoundingMode.UNNECESSARY);

	public NumberPropertyValue {
		propertyDefinitionId = PropertyValue.requirePropertyDefinitionId(propertyDefinitionId);
		value = canonicalDecimal(Objects.requireNonNull(value, "value는 null일 수 없습니다"));
	}

	// BSON 타입에 의존하지 않고 Decimal128의 유효 자릿수와 저장 지수 범위를 적용합니다.
	// 정수의 지수 표기는 정규화하되, wire의 소수 자릿수와 끝의 0은 잃지 않습니다.
	private static BigDecimal canonicalDecimal(BigDecimal original) {
		long plainLength = original.scale() <= 0
				? (original.signum() == 0 ? 1 : original.precision() - (long) original.scale())
				: Math.max(original.precision() + 1L, original.scale() + 2L);
		if (original.signum() < 0) plainLength++;
		if (plainLength > 6_200) throw invalidDecimal(null);
		try {
			var value = original.round(EXACT_DECIMAL128);
			if (value.scale() > 6_176) value = value.setScale(6_176, RoundingMode.UNNECESSARY);
			if (value.scale() < -6_111) {
				long adjustedExponent = -(long) value.scale() + value.precision() - 1;
				if (value.signum() != 0 && adjustedExponent > 6_144) throw invalidDecimal(null);
				value = value.setScale(-6_111, RoundingMode.UNNECESSARY);
			}
			if (!original.toPlainString().equals(value.toPlainString())) throw invalidDecimal(null);
			return value;
		} catch (ArithmeticException exception) {
			throw invalidDecimal(exception);
		}
	}

	private static IllegalArgumentException invalidDecimal(Throwable cause) {
		return new IllegalArgumentException("number는 소수 자릿수 손실 없이 Decimal128로 왕복할 수 있어야 합니다", cause);
	}

	@Override
	public PropertyValueType type() {
		return PropertyValueType.NUMBER;
	}
}

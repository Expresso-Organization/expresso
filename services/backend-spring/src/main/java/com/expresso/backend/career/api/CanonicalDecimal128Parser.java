package com.expresso.backend.career.api;

import java.math.BigDecimal;
import java.math.BigInteger;
import java.util.regex.Pattern;

import org.bson.types.Decimal128;

final class CanonicalDecimal128Parser {

	private static final int MAX_LENGTH = 6200;
	private static final Pattern PLAIN_DECIMAL = Pattern.compile(
			"^-?(?:0|[1-9][0-9]*)(?:\\.[0-9]+)?$");

	private CanonicalDecimal128Parser() {
	}

	static BigDecimal parse(String value, String fieldName) {
		if (value.length() > MAX_LENGTH) {
			throw invalid(fieldName, "는 6200자를 초과할 수 없습니다");
		}
		if (!PLAIN_DECIMAL.matcher(value).matches()) {
			throw invalid(fieldName, "는 지수 표기 없는 decimal 문자열이어야 합니다");
		}

		try {
			var parsed = new BigDecimal(value);
			var stored = new Decimal128(parsed);
			var roundTrip = stored.bigDecimalValue().toPlainString();
			if (!meaning(value).equals(meaning(roundTrip))) {
				throw invalid(fieldName, "의 값 또는 fractional scale을 Decimal128에 정확히 저장할 수 없습니다");
			}
			return parsed;
		}
		catch (NumberFormatException exception) {
			throw invalid(fieldName, "를 Decimal128에 rounding 없이 저장할 수 없습니다");
		}
	}

	private static DecimalMeaning meaning(String plain) {
		var negative = plain.startsWith("-");
		var unsigned = negative ? plain.substring(1) : plain;
		var decimalPoint = unsigned.indexOf('.');
		var integer = decimalPoint < 0 ? unsigned : unsigned.substring(0, decimalPoint);
		var fraction = decimalPoint < 0 ? "" : unsigned.substring(decimalPoint + 1);
		var coefficient = new BigInteger(integer + fraction);
		if (negative && coefficient.signum() != 0) coefficient = coefficient.negate();
		return new DecimalMeaning(coefficient, fraction.length());
	}

	private static CareerRecordRequestValidationException invalid(String fieldName, String reason) {
		return new CareerRecordRequestValidationException(fieldName + reason);
	}

	private record DecimalMeaning(BigInteger coefficient, int fractionalScale) {
	}
}

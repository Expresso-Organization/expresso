package com.expresso.backend.career.domain;

import java.time.DateTimeException;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.YearMonth;
import java.time.ZoneId;
import java.time.format.DateTimeParseException;
import java.util.Objects;
import java.util.Set;
import java.util.regex.Pattern;

public record DatePropertyValue(
		String propertyDefinitionId,
		Precision precision,
		String start,
		String end,
		String timezone) implements PropertyValue {

	public enum Precision {
		MONTH,
		DAY,
		DATETIME
	}

	private static final Set<String> IANA_TIMEZONES = ZoneId.getAvailableZoneIds();
	private static final Pattern MONTH_PATTERN = Pattern.compile("^[0-9]{4}-(0[1-9]|1[0-2])$");
	private static final Pattern DAY_PATTERN = Pattern.compile("^[0-9]{4}-[0-9]{2}-[0-9]{2}$");
	private static final Pattern DATETIME_PATTERN = Pattern.compile(
			"^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\\.[0-9]+)?(?:Z|[+-][0-9]{2}:[0-9]{2})$");

	public DatePropertyValue {
		propertyDefinitionId = PropertyValue.requirePropertyDefinitionId(propertyDefinitionId);
		Objects.requireNonNull(precision, "date precision은 null일 수 없습니다");
		Objects.requireNonNull(start, "date start는 null일 수 없습니다");

		validateRange(precision, start, end);
		if (precision != Precision.DATETIME && timezone != null) {
			throw new IllegalArgumentException("timezone은 datetime precision에서만 사용할 수 있습니다");
		}
		if (timezone != null && (timezone.length() > 64 || !IANA_TIMEZONES.contains(timezone))) {
			throw new IllegalArgumentException("timezone은 올바른 IANA time zone이어야 합니다");
		}
	}

	@Override
	public PropertyValueType type() {
		return PropertyValueType.DATE;
	}

	private static void validateRange(Precision precision, String start, String end) {
		try {
			switch (precision) {
				case MONTH -> validateMonthRange(start, end);
				case DAY -> validateDayRange(start, end);
				case DATETIME -> validateDatetimeRange(start, end);
			}
		}
		catch (DateTimeException exception) {
			throw new IllegalArgumentException("date start/end 형식이 precision과 일치하지 않습니다", exception);
		}
	}

	private static void validateMonthRange(String start, String end) {
		requirePattern(MONTH_PATTERN, start);
		var startValue = YearMonth.parse(start);
		if (end != null) {
			requirePattern(MONTH_PATTERN, end);
			requireOrdered(startValue.compareTo(YearMonth.parse(end)));
		}
	}

	private static void validateDayRange(String start, String end) {
		requirePattern(DAY_PATTERN, start);
		var startValue = LocalDate.parse(start);
		if (end != null) {
			requirePattern(DAY_PATTERN, end);
			requireOrdered(startValue.compareTo(LocalDate.parse(end)));
		}
	}

	private static void validateDatetimeRange(String start, String end) {
		requirePattern(DATETIME_PATTERN, start);
		var startValue = OffsetDateTime.parse(start);
		if (end != null) {
			requirePattern(DATETIME_PATTERN, end);
			requireOrdered(startValue.toInstant().compareTo(OffsetDateTime.parse(end).toInstant()));
		}
	}

	private static void requirePattern(Pattern pattern, String value) {
		if (!pattern.matcher(value).matches()) {
			throw new DateTimeParseException("날짜 형식이 정확하지 않습니다", value, 0);
		}
	}

	private static void requireOrdered(int comparison) {
		if (comparison > 0) {
			throw new IllegalArgumentException("date end는 start보다 이전일 수 없습니다");
		}
	}
}

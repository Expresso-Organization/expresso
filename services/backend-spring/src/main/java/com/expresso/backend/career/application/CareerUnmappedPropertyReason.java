package com.expresso.backend.career.application;

public enum CareerUnmappedPropertyReason {

	NO_TARGET_PROPERTY("no_target_property"),
	AMBIGUOUS_TARGET_PROPERTY("ambiguous_target_property"),
	INCOMPATIBLE_TYPE("incompatible_type"),
	MISSING_TARGET_OPTION("missing_target_option");

	private final String wireName;

	CareerUnmappedPropertyReason(String wireName) {
		this.wireName = wireName;
	}

	public String wireName() {
		return wireName;
	}

	public static CareerUnmappedPropertyReason fromWireName(String value) {
		for (var reason : values()) if (reason.wireName.equals(value)) return reason;
		throw new IllegalArgumentException("지원하지 않는 unmappedProperties reason입니다: " + value);
	}
}

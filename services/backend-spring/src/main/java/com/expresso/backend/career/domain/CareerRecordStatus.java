package com.expresso.backend.career.domain;

public enum CareerRecordStatus {
	DRAFT("draft"),
	ORGANIZED("organized"),
	VERIFIED("verified");

	private final String wireName;

	CareerRecordStatus(String wireName) {
		this.wireName = wireName;
	}

	public String wireName() {
		return wireName;
	}

	public static CareerRecordStatus fromWireName(String wireName) {
		for (var status : values()) {
			if (status.wireName.equals(wireName)) {
				return status;
			}
		}
		throw new IllegalArgumentException("지원하지 않는 CareerRecord status입니다");
	}
}

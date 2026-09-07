package com.expresso.backend.career.domain;

import java.util.Locale;

public enum PropertyDefinitionType {

	TEXT(true),
	NUMBER(true),
	SELECT(true),
	MULTI_SELECT(true),
	DATE(true),
	CHECKBOX(true),
	URL(true),
	EMAIL(true),
	PHONE(true),
	FILE(true),
	MEDIA(true),
	RELATION(false),
	FORMULA(false),
	ROLLUP(false),
	CREATED_TIME(false),
	UPDATED_TIME(false);

	private final boolean writable;

	PropertyDefinitionType(boolean writable) {
		this.writable = writable;
	}

	public boolean writable() {
		return writable;
	}

	public String wireName() {
		return name().toLowerCase(Locale.ROOT);
	}

	public static PropertyDefinitionType fromStoredName(String storedName) {
		if ("tags".equals(storedName)) {
			return MULTI_SELECT;
		}
		if ("boolean".equals(storedName)) {
			return CHECKBOX;
		}
		try {
			return valueOf(storedName.toUpperCase());
		}
		catch (IllegalArgumentException | NullPointerException exception) {
			throw new IllegalStateException("지원하지 않는 PropertyDefinition type입니다: " + storedName, exception);
		}
	}

}

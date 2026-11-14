package com.expresso.backend.career.domain;

import java.util.Locale;

public enum PropertyValueType {

	TEXT,
	NUMBER,
	CHECKBOX,
	SELECT,
	MULTI_SELECT,
	DATE,
	URL,
	EMAIL,
	PHONE,
	FILE,
	MEDIA;

	public String wireName() {
		return name().toLowerCase(Locale.ROOT);
	}
}

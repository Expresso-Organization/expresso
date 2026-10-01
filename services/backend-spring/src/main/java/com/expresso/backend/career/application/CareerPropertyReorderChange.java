package com.expresso.backend.career.application;

public record CareerPropertyReorderChange(
		String propertyId,
		int order) implements CareerPropertySchemaChange {
}

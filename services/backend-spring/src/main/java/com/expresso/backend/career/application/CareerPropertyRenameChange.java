package com.expresso.backend.career.application;

public record CareerPropertyRenameChange(
		String propertyId,
		String name) implements CareerPropertySchemaChange {
}

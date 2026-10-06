package com.expresso.backend.career.application;

public sealed interface CareerPropertySchemaChange
		permits CareerPropertyCreateChange, CareerPropertyRenameChange, CareerPropertyReorderChange {
}

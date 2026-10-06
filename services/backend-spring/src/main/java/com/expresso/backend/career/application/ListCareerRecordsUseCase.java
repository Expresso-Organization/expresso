package com.expresso.backend.career.application;

public interface ListCareerRecordsUseCase {

	CareerRecordPage list(String ownerId, String categoryId, int limit, String cursor);
}

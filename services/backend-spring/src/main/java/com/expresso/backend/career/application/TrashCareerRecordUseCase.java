package com.expresso.backend.career.application;

public interface TrashCareerRecordUseCase {

	CareerRecordTrashResult trash(String ownerId, String recordId, long expectedVersion);
}

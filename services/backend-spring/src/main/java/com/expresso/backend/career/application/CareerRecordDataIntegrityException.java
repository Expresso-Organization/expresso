package com.expresso.backend.career.application;

public class CareerRecordDataIntegrityException extends RuntimeException {

	public CareerRecordDataIntegrityException(Throwable cause) {
		super("Mongo CareerRecord의 canonical 데이터가 올바르지 않습니다", cause);
	}

}

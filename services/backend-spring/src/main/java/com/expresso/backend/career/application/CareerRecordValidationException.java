package com.expresso.backend.career.application;

public class CareerRecordValidationException extends RuntimeException {

	public CareerRecordValidationException(String message) {
		super(message);
	}

	public CareerRecordValidationException(String message, Throwable cause) {
		super(message, cause);
	}

}

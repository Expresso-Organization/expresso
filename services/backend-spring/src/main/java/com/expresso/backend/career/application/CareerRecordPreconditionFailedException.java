package com.expresso.backend.career.application;

public class CareerRecordPreconditionFailedException extends RuntimeException {

	public CareerRecordPreconditionFailedException() {
		super("If-Match version이 현재 CareerRecord version과 일치하지 않습니다");
	}

}

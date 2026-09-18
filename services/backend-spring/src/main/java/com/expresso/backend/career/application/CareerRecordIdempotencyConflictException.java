package com.expresso.backend.career.application;

public class CareerRecordIdempotencyConflictException extends RuntimeException {

	public CareerRecordIdempotencyConflictException() {
		super("같은 사용자의 Idempotency-Key가 다른 CareerRecord 생성 요청에 이미 사용되었습니다");
	}

}

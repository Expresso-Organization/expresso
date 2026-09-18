package com.expresso.backend.career.application;

public class CareerComputationOutboxConflictException extends RuntimeException {

	public CareerComputationOutboxConflictException() {
		super("같은 idempotencyKey에 서로 다른 career.computation payload가 저장되어 있습니다");
	}
}

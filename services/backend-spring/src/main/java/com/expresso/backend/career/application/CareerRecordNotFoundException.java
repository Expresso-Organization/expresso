package com.expresso.backend.career.application;

public class CareerRecordNotFoundException extends RuntimeException {

	public CareerRecordNotFoundException() {
		super("현재 사용자가 조회할 수 있는 canonical CareerRecord를 찾을 수 없습니다");
	}

}

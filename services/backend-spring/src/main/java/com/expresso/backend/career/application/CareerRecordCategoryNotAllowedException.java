package com.expresso.backend.career.application;

public class CareerRecordCategoryNotAllowedException extends RuntimeException {

	public CareerRecordCategoryNotAllowedException() {
		super("사용할 수 있는 system Category 또는 소유한 custom Category가 아닙니다");
	}

}

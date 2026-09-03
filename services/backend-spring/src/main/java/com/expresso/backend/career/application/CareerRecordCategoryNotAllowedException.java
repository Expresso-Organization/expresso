package com.expresso.backend.career.application;

public class CareerRecordCategoryNotAllowedException extends RuntimeException {

	public CareerRecordCategoryNotAllowedException() {
		super("첫 Career Slice에서 사용할 수 있는 system Category가 아닙니다");
	}

}

package com.expresso.backend.career.application;

public interface CareerComputationOutbox {

	void append(CareerComputationEvent event);
}

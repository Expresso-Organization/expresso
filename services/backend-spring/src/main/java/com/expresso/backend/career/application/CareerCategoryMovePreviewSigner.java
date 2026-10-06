package com.expresso.backend.career.application;

import java.time.Instant;

public interface CareerCategoryMovePreviewSigner {

	String sign(CareerCategoryMoveToken token, Instant now);

	boolean verify(String signedToken, CareerCategoryMoveToken expected, Instant now);
}

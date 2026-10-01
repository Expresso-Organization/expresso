package com.expresso.backend.career.application;

import java.time.Instant;

public interface CareerPropertyCreatePreviewSigner {

	String sign(CareerPropertyCreatePreviewToken token, Instant now);

	boolean verify(String signedToken, CareerPropertyCreatePreviewToken expected, Instant now);
}

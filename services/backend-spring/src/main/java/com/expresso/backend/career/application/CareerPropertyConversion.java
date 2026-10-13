package com.expresso.backend.career.application;

import com.expresso.backend.career.domain.PropertyValue;

public record CareerPropertyConversion(
		String sourcePropertyId,
		String targetPropertyId,
		Kind kind,
		PropertyValue sampleBefore,
		PropertyValue sampleAfter) {

	public enum Kind { EXACT, SAFE, LOSSY, UNMAPPED }
}

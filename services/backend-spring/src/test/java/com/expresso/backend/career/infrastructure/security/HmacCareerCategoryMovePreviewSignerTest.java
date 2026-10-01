package com.expresso.backend.career.infrastructure.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Instant;

import org.junit.jupiter.api.Test;

import com.expresso.backend.career.application.CareerCategoryMoveToken;

class HmacCareerCategoryMovePreviewSignerTest {

	private static final Instant NOW = Instant.parse("2026-09-14T09:00:00Z");
	private static final CareerCategoryMoveToken TOKEN = new CareerCategoryMoveToken(
			"10000000-0000-4000-8000-000000000001", "10000000-0000-4000-8000-000000000002",
			"10000000-0000-4000-8000-000000000003", "10000000-0000-4000-8000-000000000004",
			1, 2, 3, "plan-digest");

	@Test
	void signsForFifteenMinutesAndRejectsTamperingOrExpiry() {
		var signer = new HmacCareerCategoryMovePreviewSigner("test-category-move-preview-secret-1234567890");
		var signed = signer.sign(TOKEN, NOW);

		assertThat(signer.verify(signed, TOKEN, NOW.plusSeconds(899))).isTrue();
		assertThat(signer.verify(signed + "x", TOKEN, NOW)).isFalse();
		assertThat(signer.verify(signed, TOKEN, NOW.plusSeconds(901))).isFalse();
	}

	@Test
	void refusesAnAbsentOrWeakProductionSecret() {
		assertThatThrownBy(() -> new HmacCareerCategoryMovePreviewSigner("short"))
				.isInstanceOf(IllegalArgumentException.class)
				.hasMessageContaining("32자 이상");
	}
}

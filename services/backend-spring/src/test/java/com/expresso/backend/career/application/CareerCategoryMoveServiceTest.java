package com.expresso.backend.career.application;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.Test;

import com.expresso.backend.career.domain.BlockBody;
import com.expresso.backend.career.domain.CareerCategory;
import com.expresso.backend.career.domain.CareerRecord;
import com.expresso.backend.career.domain.PropertyDefinition;
import com.expresso.backend.career.domain.PropertyDefinitionType;
import com.expresso.backend.career.domain.PropertyValueType;
import com.expresso.backend.career.domain.TextualPropertyValue;

class CareerCategoryMoveServiceTest {

	private static final String USER_ID = "10000000-0000-4000-8000-000000000001";
	private static final String RECORD_ID = "10000000-0000-4000-8000-000000000002";
	private static final String SOURCE_CATEGORY_ID = "10000000-0000-4000-8000-000000000003";
	private static final String TARGET_CATEGORY_ID = "10000000-0000-4000-8000-000000000004";
	private static final String SOURCE_PROPERTY_ID = "10000000-0000-4000-8000-000000000005";
	private static final String TARGET_PROPERTY_ID = "10000000-0000-4000-8000-000000000006";
	private static final Instant NOW = Instant.parse("2026-09-14T09:00:00Z");

	@Test
	void commitsWithSourceAndTargetComputationIdsButOnlyTargetDefinitionVersions() {
		var repository = new FakeRepository();
		var outbox = new CapturingOutbox();
		var service = new CareerCategoryMoveService(
				repository,
				new CareerCategoryMovePlanner(),
				new FakeSigner(),
				outbox,
				Clock.fixed(NOW, ZoneOffset.UTC));

		var preview = service.preview(USER_ID, RECORD_ID, TARGET_CATEGORY_ID);
		var moved = service.commit(USER_ID, RECORD_ID, 7, new CommitCareerCategoryMoveCommand(
				TARGET_CATEGORY_ID, preview.previewToken(), 7, List.of()));

		assertThat(moved.categoryId()).isEqualTo(TARGET_CATEGORY_ID);
		assertThat(repository.committedPlan.computationPropertyIds())
				.containsExactly(SOURCE_PROPERTY_ID, TARGET_PROPERTY_ID);
		assertThat(outbox.events).singleElement().satisfies(event -> {
			assertThat(event.changedPropertyIds()).containsExactly(SOURCE_PROPERTY_ID, TARGET_PROPERTY_ID);
			assertThat(event.sourcePropertyVersions()).containsExactlyEntriesOf(Map.of(TARGET_PROPERTY_ID, 4L));
			assertThat(event.sourceRecordVersion()).isEqualTo(8);
		});
	}

	private static final class FakeRepository implements CareerCategoryMoveRepository {
		private final CareerRecord record = new CareerRecord(
				RECORD_ID, USER_ID, SOURCE_CATEGORY_ID, "기록",
				List.of(new TextualPropertyValue(SOURCE_PROPERTY_ID, PropertyValueType.TEXT, "값")),
				BlockBody.empty("20000000-0000-4000-8000-000000000001"), 7, NOW.minusSeconds(60));
		private CareerCategoryMovePlan committedPlan;

		@Override
		public Optional<CareerCategoryMoveRecordSnapshot> findOwnedRecord(String userId, String recordId) {
			return Optional.of(new CareerCategoryMoveRecordSnapshot(record, Map.of()));
		}

		@Override
		public Optional<CareerCategoryMoveCategorySnapshot> findReadableCategory(String userId, String categoryId) {
			var definition = categoryId.equals(SOURCE_CATEGORY_ID)
					? definition(SOURCE_PROPERTY_ID, 2)
					: definition(TARGET_PROPERTY_ID, 4);
			return Optional.of(new CareerCategoryMoveCategorySnapshot(
					new CareerCategory(categoryId, categoryId, categoryId, List.of(definition)), 3));
		}

		@Override
		public Optional<CareerRecord> move(
				CareerCategoryMoveRecordSnapshot current,
				String targetCategoryId,
				CareerCategoryMovePlan plan,
				CareerUnmappedProperties unmapped,
				Instant changedAt) {
			this.committedPlan = plan;
			return Optional.of(current.record().moveTo(targetCategoryId, plan.propertyValues(), changedAt));
		}
	}

	private static final class FakeSigner implements CareerCategoryMovePreviewSigner {
		@Override
		public String sign(CareerCategoryMoveToken token, Instant now) {
			return "signed-preview-token-that-is-long-enough";
		}

		@Override
		public boolean verify(String token, CareerCategoryMoveToken expected, Instant now) {
			return token.equals("signed-preview-token-that-is-long-enough");
		}
	}

	private static final class CapturingOutbox implements CareerComputationOutbox {
		private final List<CareerComputationEvent> events = new ArrayList<>();

		@Override
		public void append(CareerComputationEvent event) {
			events.add(event);
		}
	}

	private static PropertyDefinition definition(String id, long version) {
		return new PropertyDefinition(id, "role", "역할", PropertyDefinitionType.TEXT,
				false, false, Map.of(), 0, version, null);
	}
}

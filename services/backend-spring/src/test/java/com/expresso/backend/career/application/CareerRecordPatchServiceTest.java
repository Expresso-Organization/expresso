package com.expresso.backend.career.application;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

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
import com.expresso.backend.career.domain.CareerRecordChangeSet;
import com.expresso.backend.career.domain.PropertyDefinition;
import com.expresso.backend.career.domain.PropertyDefinitionType;
import com.expresso.backend.career.domain.PropertyValue;
import com.expresso.backend.career.domain.PropertyValueType;
import com.expresso.backend.career.domain.TextualPropertyValue;

class CareerRecordPatchServiceTest {

	private static final String USER_ID = "bc2f9791-0bb1-4a31-a23d-ea720f31284d";
	private static final String RECORD_ID = "10ecce84-8d6b-4b76-87de-ec76729f9b90";
	private static final String CATEGORY_ID = "475106fc-bf88-4a73-9c27-66c648733936";
	private static final String PROPERTY_ID = "6c663539-48c1-5d12-939d-f100fac993c1";
	private static final Instant NOW = Instant.parse("2026-09-14T00:00:00Z");

	@Test
	void appendsChangedPropertyIdsWithTheUpdatedRecordVersion() {
		var repository = new FakeRecordRepository(record(List.of()));
		var outbox = new RecordingOutbox();
		var service = service(repository, outbox);
		var value = new TextualPropertyValue(PROPERTY_ID, PropertyValueType.TEXT, "새 값");

		var updated = service.patch(USER_ID, RECORD_ID, 3,
				CareerRecordChangeSet.none().withPropertyValues(List.of(value)));

		assertEquals(4, updated.version());
		assertEquals(List.of(new CareerComputationEvent(
				USER_ID, RECORD_ID, List.of(PROPERTY_ID), 4, Map.of(PROPERTY_ID, 2L))), outbox.events);
	}

	@Test
	void doesNotAppendComputationWorkForTitleOnlyOrSemanticNoOpPropertyChanges() {
		var value = new TextualPropertyValue(PROPERTY_ID, PropertyValueType.TEXT, "값");
		var repository = new FakeRecordRepository(record(List.of(value)));
		var outbox = new RecordingOutbox();
		var service = service(repository, outbox);

		service.patch(USER_ID, RECORD_ID, 3, CareerRecordChangeSet.none().withTitle("새 제목"));
		service.patch(USER_ID, RECORD_ID, 4,
				CareerRecordChangeSet.none().withPropertyValues(List.of(value)));

		assertTrue(outbox.events.isEmpty());
	}

	private static CareerRecordPatchService service(FakeRecordRepository repository, RecordingOutbox outbox) {
		var definition = new PropertyDefinition(PROPERTY_ID, "role", "역할", PropertyDefinitionType.TEXT,
				false, true, Map.of(), 0, 2, null);
		var category = new CareerCategory(CATEGORY_ID, "experience", "경험", List.of(definition));
		CareerCategoryRepository categories = new CareerCategoryRepository() {
			@Override
			public List<CareerCategory> findSystemCategories() { return List.of(category); }

			@Override
			public boolean existsSystemCategory(String categoryId) { return CATEGORY_ID.equals(categoryId); }

			@Override
			public Optional<CareerCategory> findSystemCategoryById(String categoryId) {
				return CATEGORY_ID.equals(categoryId) ? Optional.of(category) : Optional.empty();
			}
		};
		return new CareerRecordPatchService(repository, categories,
				Clock.fixed(NOW, ZoneOffset.UTC), outbox);
	}

	private static CareerRecord record(List<PropertyValue> values) {
		return new CareerRecord(RECORD_ID, USER_ID, CATEGORY_ID, "", values,
				new BlockBody(List.of()), 3, Instant.parse("2026-09-13T00:00:00Z"));
	}

	private static final class RecordingOutbox implements CareerComputationOutbox {
		private final List<CareerComputationEvent> events = new ArrayList<>();

		@Override
		public void append(CareerComputationEvent event) {
			events.add(event);
		}
	}

	private static final class FakeRecordRepository implements CareerRecordRepository {
		private CareerRecord current;

		private FakeRecordRepository(CareerRecord current) {
			this.current = current;
		}

		@Override
		public Optional<CareerRecord> findOwnedCanonicalById(String ownerId, String recordId) {
			return current.ownerId().equals(ownerId) && current.id().equals(recordId)
					? Optional.of(current) : Optional.empty();
		}

		@Override
		public Optional<CareerRecord> updateOwnedCanonical(CareerRecord before, CareerRecord after) {
			if (current.version() != before.version()) return Optional.empty();
			current = after;
			return Optional.of(after);
		}

		@Override
		public CreateResult createOrReplay(CareerRecord newRecord, String idempotencyKey, String requestHash) {
			throw new UnsupportedOperationException();
		}

		@Override
		public Optional<CareerRecord> updateOwnedStatus(CareerRecord record,
				com.expresso.backend.career.domain.CareerRecordStatus status, Instant changedAt) {
			throw new UnsupportedOperationException();
		}
	}
}

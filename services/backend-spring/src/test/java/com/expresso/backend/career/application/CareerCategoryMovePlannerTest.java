package com.expresso.backend.career.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Instant;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

import com.expresso.backend.career.domain.CareerCategory;
import com.expresso.backend.career.domain.CareerRecord;
import com.expresso.backend.career.domain.PropertyDefinition;
import com.expresso.backend.career.domain.PropertyDefinitionType;
import com.expresso.backend.career.domain.PropertyValueType;
import com.expresso.backend.career.domain.SelectPropertyValue;
import com.expresso.backend.career.domain.TextualPropertyValue;

class CareerCategoryMovePlannerTest {

	private static final String SOURCE_CATEGORY_ID = "10000000-0000-4000-8000-000000000001";
	private static final String TARGET_CATEGORY_ID = "10000000-0000-4000-8000-000000000002";
	private static final String SOURCE_PROPERTY_ID = "20000000-0000-4000-8000-000000000001";
	private static final String TARGET_PROPERTY_ID = "20000000-0000-4000-8000-000000000002";
	private static final String SOURCE_OPTION_ID = "30000000-0000-4000-8000-000000000001";
	private static final String TARGET_OPTION_ID = "30000000-0000-4000-8000-000000000002";
	private static final Instant NOW = Instant.parse("2026-09-14T08:00:00Z");

	@Test
	void preservesAnUnmappedCanonicalValueWithSourceProvenance() {
		var record = record(new TextualPropertyValue(SOURCE_PROPERTY_ID, PropertyValueType.TEXT, "원본 값"));
		var source = category(SOURCE_CATEGORY_ID, definition(SOURCE_PROPERTY_ID, "role", "역할", PropertyDefinitionType.TEXT, 3, Map.of()));
		var target = category(TARGET_CATEGORY_ID);

		var plan = new CareerCategoryMovePlanner().plan(record, source, target, Map.of(), NOW);

		var envelope = plan.unmappedProperties().get(SOURCE_PROPERTY_ID);
		assertThat(envelope.sourceCategoryId()).isEqualTo(SOURCE_CATEGORY_ID);
		assertThat(envelope.propertyValue()).isEqualTo(record.propertyValues().getFirst());
		assertThat(envelope.provenance()).satisfies(provenance -> {
			assertThat(provenance.sourcePropertyKey()).isEqualTo("role");
			assertThat(provenance.sourcePropertyName()).isEqualTo("역할");
			assertThat(provenance.sourcePropertyDefinitionVersion()).isEqualTo(3);
			assertThat(provenance.sourceRecordVersion()).isEqualTo(7);
			assertThat(provenance.reason()).isEqualTo(CareerUnmappedPropertyReason.NO_TARGET_PROPERTY);
		});
		assertThat(plan.computationPropertyIds()).containsExactly(SOURCE_PROPERTY_ID);
		assertThat(plan.targetPropertyVersions()).isEmpty();
	}

	@Test
	void mapsSelectValuesOnlyThroughOneExactTargetOptionName() {
		var sourceConfig = Map.<String, Object>of("options", List.of(Map.of("id", SOURCE_OPTION_ID, "name", "Java")));
		var targetConfig = Map.<String, Object>of("options", List.of(Map.of("id", TARGET_OPTION_ID, "name", "Java")));
		var record = record(new SelectPropertyValue(SOURCE_PROPERTY_ID, SOURCE_OPTION_ID));
		var source = category(SOURCE_CATEGORY_ID, definition(SOURCE_PROPERTY_ID, "skill", "기술", PropertyDefinitionType.SELECT, 2, sourceConfig));
		var target = category(TARGET_CATEGORY_ID, definition(TARGET_PROPERTY_ID, "skill", "기술", PropertyDefinitionType.SELECT, 5, targetConfig));

		var plan = new CareerCategoryMovePlanner().plan(record, source, target, Map.of(), NOW);

		assertThat(plan.propertyValues()).containsExactly(new SelectPropertyValue(TARGET_PROPERTY_ID, TARGET_OPTION_ID));
		assertThat(plan.unmappedProperties()).isEmpty();
		assertThat(plan.computationPropertyIds()).containsExactly(SOURCE_PROPERTY_ID, TARGET_PROPERTY_ID);
		assertThat(plan.targetPropertyVersions()).containsExactlyEntriesOf(Map.of(TARGET_PROPERTY_ID, 5L));
	}

	@Test
	void doesNotCreateAMissingTargetSelectOption() {
		var sourceConfig = Map.<String, Object>of("options", List.of(Map.of("id", SOURCE_OPTION_ID, "name", "Java")));
		var record = record(new SelectPropertyValue(SOURCE_PROPERTY_ID, SOURCE_OPTION_ID));
		var source = category(SOURCE_CATEGORY_ID, definition(SOURCE_PROPERTY_ID, "skill", "기술", PropertyDefinitionType.SELECT, 2, sourceConfig));
		var target = category(TARGET_CATEGORY_ID, definition(TARGET_PROPERTY_ID, "skill", "기술", PropertyDefinitionType.SELECT, 5, Map.of("options", List.of())));

		var plan = new CareerCategoryMovePlanner().plan(record, source, target, Map.of(), NOW);

		assertThat(plan.propertyValues()).isEmpty();
		assertThat(plan.unmappedProperties().get(SOURCE_PROPERTY_ID).provenance().reason())
				.isEqualTo(CareerUnmappedPropertyReason.MISSING_TARGET_OPTION);
		assertThat(target.propertyDefinitions().getFirst().config()).isEqualTo(Map.of("options", List.of()));
	}

	@Test
	void rejectsAmbiguousExactTargetOptionNamesAsDataIntegrityFailure() {
		var sourceConfig = Map.<String, Object>of("options", List.of(Map.of("id", SOURCE_OPTION_ID, "name", "Java")));
		var duplicateTargetOptions = List.of(
				Map.of("id", TARGET_OPTION_ID, "name", "Java"),
				Map.of("id", "30000000-0000-4000-8000-000000000003", "name", "Java"));
		var record = record(new SelectPropertyValue(SOURCE_PROPERTY_ID, SOURCE_OPTION_ID));
		var source = category(SOURCE_CATEGORY_ID, definition(SOURCE_PROPERTY_ID, "skill", "기술", PropertyDefinitionType.SELECT, 2, sourceConfig));
		var target = category(TARGET_CATEGORY_ID, definition(TARGET_PROPERTY_ID, "skill", "기술", PropertyDefinitionType.SELECT, 5, Map.of("options", duplicateTargetOptions)));

		assertThatThrownBy(() -> new CareerCategoryMovePlanner().plan(record, source, target, Map.of(), NOW))
				.isInstanceOf(CareerRecordDataIntegrityException.class);
	}

	private static CareerRecord record(com.expresso.backend.career.domain.PropertyValue value) {
		return new CareerRecord(
				"40000000-0000-4000-8000-000000000001",
				"50000000-0000-4000-8000-000000000001",
				SOURCE_CATEGORY_ID,
				"기록",
				List.of(value),
				com.expresso.backend.career.domain.BlockBody.empty("60000000-0000-4000-8000-000000000001"),
				7,
				NOW.minusSeconds(60));
	}

	private static CareerCategory category(String id, PropertyDefinition... definitions) {
		return new CareerCategory(id, id.equals(SOURCE_CATEGORY_ID) ? "source" : "target", "카테고리", List.of(definitions));
	}

	private static PropertyDefinition definition(
			String id, String key, String name, PropertyDefinitionType type, long version, Map<String, Object> config) {
		return new PropertyDefinition(id, key, name, type, false, false, config, 0, version, null);
	}
}

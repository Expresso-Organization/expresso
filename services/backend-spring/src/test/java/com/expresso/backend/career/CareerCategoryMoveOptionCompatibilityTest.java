package com.expresso.backend.career;

import static org.junit.jupiter.api.Assertions.*;

import java.time.Instant;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

import com.expresso.backend.career.application.CareerCategoryMovePlan;
import com.expresso.backend.career.application.CareerCategoryMovePlanner;
import com.expresso.backend.career.application.CareerPropertyConversion;
import com.expresso.backend.career.application.CareerRecordDataIntegrityException;
import com.expresso.backend.career.application.CareerUnmappedPropertyReason;
import com.expresso.backend.career.domain.CareerCategory;
import com.expresso.backend.career.domain.CareerRecord;
import com.expresso.backend.career.domain.CareerRecordStatus;
import com.expresso.backend.career.domain.MultiSelectPropertyValue;
import com.expresso.backend.career.domain.PropertyDefinition;
import com.expresso.backend.career.domain.PropertyDefinitionType;
import com.expresso.backend.career.domain.PropertyValue;
import com.expresso.backend.career.domain.SelectPropertyValue;

class CareerCategoryMoveOptionCompatibilityTest {
    @Test
    void selectMapsNameAndLabelOnlyOptionsInEitherCategoryWithoutChangingDefinitions() {
        for (var sourceField : List.of("name", "label")) {
            for (var targetField : List.of("name", "label")) {
                var sourceOptions = List.of(option(21, sourceField, " 선택 "));
                var targetOptions = List.of(option(31, targetField, " 선택 "));
                var source = definition(11, PropertyDefinitionType.SELECT, sourceOptions);
                var target = definition(12, PropertyDefinitionType.SELECT, targetOptions);
                var original = new SelectPropertyValue(id(11), id(21));

                var result = plan(source, target, original);

                assertEquals(List.of(new SelectPropertyValue(id(12), id(31))), result.propertyValues());
                assertTrue(result.unmappedProperties().isEmpty());
                assertEquals(original, result.conversions().getFirst().sampleBefore());
                assertEquals(new SelectPropertyValue(id(12), id(31)), result.conversions().getFirst().sampleAfter());
                assertEquals(sourceOptions, source.config().get("options"));
                assertEquals(targetOptions, target.config().get("options"));
            }
        }
    }

    @Test
    void multiSelectMapsNameAndLabelOnlyOptionsWithoutReorderingSelectedValues() {
        for (var sourceField : List.of("name", "label")) {
            for (var targetField : List.of("name", "label")) {
                var source = definition(11, PropertyDefinitionType.MULTI_SELECT,
                        List.of(option(21, sourceField, "One"), option(22, sourceField, "Two")));
                var target = definition(12, PropertyDefinitionType.MULTI_SELECT,
                        List.of(option(31, targetField, "One"), option(32, targetField, "Two")));

                var result = plan(source, target, new MultiSelectPropertyValue(id(11), List.of(id(22), id(21))));

                assertEquals(List.of(new MultiSelectPropertyValue(id(12), List.of(id(32), id(31)))), result.propertyValues());
                assertTrue(result.unmappedProperties().isEmpty());
                assertEquals(CareerPropertyConversion.Kind.SAFE, result.conversions().getFirst().kind());
            }
        }
    }

    @Test
    void labelOnlyOptionsKeepSelectAndMultiSelectConversionSemantics() {
        var sourceSelect = definition(11, PropertyDefinitionType.SELECT, List.of(option(21, "label", "One")));
        var targetMulti = definition(12, PropertyDefinitionType.MULTI_SELECT, List.of(option(31, "name", "One")));
        var expanded = plan(sourceSelect, targetMulti, new SelectPropertyValue(id(11), id(21)));
        assertEquals(List.of(new MultiSelectPropertyValue(id(12), List.of(id(31)))), expanded.propertyValues());
        assertEquals(CareerPropertyConversion.Kind.SAFE, expanded.conversions().getFirst().kind());

        var sourceMulti = definition(11, PropertyDefinitionType.MULTI_SELECT,
                List.of(option(21, "name", "One"), option(22, "label", "Two")));
        var targetSelect = definition(12, PropertyDefinitionType.SELECT,
                List.of(option(31, "label", "One"), option(32, "name", "Two")));
        var collapsed = plan(sourceMulti, targetSelect, new MultiSelectPropertyValue(id(11), List.of(id(22), id(21))));
        assertEquals(List.of(new SelectPropertyValue(id(12), id(32))), collapsed.propertyValues());
        assertEquals(CareerPropertyConversion.Kind.LOSSY, collapsed.conversions().getFirst().kind());
    }

    @Test
    void coherentPrivateOverlayOptionsMatchOrdinaryOptionsUsingTheOriginalText() {
        var overlayOption = Map.<String, Object>of("id", id(21), "name", " Private ", "label", " Private ", "color", "blue");
        var ordinaryOption = option(31, "label", " Private ");
        var source = definition(11, PropertyDefinitionType.SELECT, List.of(overlayOption));
        var target = definition(12, PropertyDefinitionType.SELECT, List.of(ordinaryOption));

        var result = plan(source, target, new SelectPropertyValue(id(11), id(21)));

        assertEquals(List.of(new SelectPropertyValue(id(12), id(31))), result.propertyValues());
        assertEquals(List.of(overlayOption), source.config().get("options"));
        assertEquals(List.of(ordinaryOption), target.config().get("options"));
    }

    @Test
    void optionMatchingDoesNotTrimOrFoldCaseOrWhitespace() {
        for (var targetText : List.of("Private", " private ", " Private  ")) {
            var source = definition(11, PropertyDefinitionType.SELECT, List.of(option(21, "label", " Private ")));
            var target = definition(12, PropertyDefinitionType.SELECT, List.of(option(31, "name", targetText)));
            var original = new SelectPropertyValue(id(11), id(21));

            assertPreservedAsMissingOption(plan(source, target, original), original);
        }
    }

    @Test
    void duplicateTargetOptionTextAcrossNameAndLabelIsAmbiguous() {
        var source = definition(11, PropertyDefinitionType.SELECT, List.of(option(21, "name", "Same")));
        var target = definition(12, PropertyDefinitionType.SELECT,
                List.of(option(31, "name", "Same"), option(32, "label", "Same")));

        assertThrows(CareerRecordDataIntegrityException.class,
                () -> plan(source, target, new SelectPropertyValue(id(11), id(21))));
    }

    @Test
    void conflictingOrWronglyTypedDisplayAliasesAreRejectedInEitherCategory() {
        var validSource = definition(11, PropertyDefinitionType.SELECT, List.of(option(21, "name", "One")));
        var validTarget = definition(12, PropertyDefinitionType.SELECT, List.of(option(31, "name", "One")));
        for (var invalidOption : List.of(
                Map.<String, Object>of("id", id(21), "name", "One", "label", "Other"),
                Map.<String, Object>of("id", id(21), "name", "One", "label", 17),
                Map.<String, Object>of("id", id(21), "name", 17, "label", "One"))) {
            var invalidSource = definition(11, PropertyDefinitionType.SELECT, List.of(invalidOption));
            var invalidTarget = definition(12, PropertyDefinitionType.SELECT, List.of(invalidOption));
            assertThrows(CareerRecordDataIntegrityException.class,
                    () -> plan(invalidSource, validTarget, new SelectPropertyValue(id(11), id(21))));
            assertThrows(CareerRecordDataIntegrityException.class,
                    () -> plan(validSource, invalidTarget, new SelectPropertyValue(id(11), id(21))));
        }
    }

    @Test
    void malformedOptionIdsAndMissingDisplayTextRemainRejected() {
        var source = definition(11, PropertyDefinitionType.SELECT, List.of(option(21, "name", "One")));
        for (var invalidOption : List.of(
                Map.<String, Object>of("id", 17, "label", "One"),
                Map.<String, Object>of("id", id(31), "color", "blue"))) {
            var target = definition(12, PropertyDefinitionType.SELECT, List.of(invalidOption));
            assertThrows(CareerRecordDataIntegrityException.class,
                    () -> plan(source, target, new SelectPropertyValue(id(11), id(21))));
        }
    }

    @Test
    void unknownSelectedOptionIdsRemainPreservedAsUnmapped() {
        var source = definition(11, PropertyDefinitionType.SELECT, List.of(option(21, "name", "One")));
        var target = definition(12, PropertyDefinitionType.SELECT, List.of(option(31, "name", "One")));
        var original = new SelectPropertyValue(id(11), id(29));

        assertPreservedAsMissingOption(plan(source, target, original), original);
    }

    @Test
    void duplicateOptionIdsAndNonListConfigurationsFailClosed() {
        var source = definition(11, PropertyDefinitionType.SELECT, List.of(option(21, "name", "One")));
        var duplicate = definition(12, PropertyDefinitionType.SELECT,
                List.of(option(31, "name", "One"), option(31, "name", "Other")));
        assertThrows(CareerRecordDataIntegrityException.class,
                () -> plan(source, duplicate, new SelectPropertyValue(id(11), id(21))));
        var malformed = new PropertyDefinition(id(12), "choice", "Choice", PropertyDefinitionType.SELECT,
                false, false, Map.of("options", "invalid"), 0, 1, null);
        assertThrows(CareerRecordDataIntegrityException.class,
                () -> plan(source, malformed, new SelectPropertyValue(id(11), id(21))));
    }

    private static void assertPreservedAsMissingOption(CareerCategoryMovePlan result, PropertyValue original) {
        assertTrue(result.propertyValues().isEmpty());
        assertEquals(original, result.unmappedProperties().get(id(11)).propertyValue());
        assertEquals(CareerUnmappedPropertyReason.MISSING_TARGET_OPTION,
                result.unmappedProperties().get(id(11)).provenance().reason());
        assertEquals(CareerPropertyConversion.Kind.UNMAPPED, result.conversions().getFirst().kind());
    }

    private static Map<String, Object> option(int optionId, String field, String text) {
        return Map.of("id", id(optionId), field, text, "color", "blue");
    }

    private static PropertyDefinition definition(int propertyId, PropertyDefinitionType type, List<Map<String, Object>> options) {
        return new PropertyDefinition(id(propertyId), "choice", "Choice", type, false, false,
                Map.of("options", options), 0, 1, null);
    }

    private static CareerCategoryMovePlan plan(PropertyDefinition source, PropertyDefinition target, PropertyValue value) {
        var record = new CareerRecord(id(4), id(2), id(3), "", List.of(value), CareerRecordStatus.DRAFT, 1, Instant.EPOCH);
        return new CareerCategoryMovePlanner().plan(record,
                new CareerCategory(id(3), "source", "Source", List.of(source)),
                new CareerCategory(id(5), "target", "Target", List.of(target)),
                Map.of(), Instant.parse("2026-10-30T00:00:00Z"));
    }

    private static String id(int number) {
        return String.format("00000000-0000-4000-8000-%012d", number);
    }
}

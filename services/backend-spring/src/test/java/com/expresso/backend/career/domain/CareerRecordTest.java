package com.expresso.backend.career.domain;

import static com.expresso.backend.career.domain.BusinessRecordFixture.id;
import static org.junit.jupiter.api.Assertions.*;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

import org.junit.jupiter.api.Test;

class CareerRecordTest {
    private static final Instant NOW = Instant.parse("2026-10-06T01:02:03Z");
    private static final Instant LATER = NOW.plusSeconds(60);

    @Test
    void createsBusinessRecordWithoutBodyOrParagraphId() {
        var record = CareerRecord.create(id(1), id(2), id(3), NOW);
        assertEquals("", record.title());
        assertEquals(List.of(), record.propertyValues());
        assertEquals(CareerRecordStatus.DRAFT, record.status());
        assertEquals(1, record.version());
        assertEquals(NOW, record.updatedAt());
    }

    @Test
    void changesOnlyBusinessFieldsAndAdvancesVersionOnce() {
        var record = CareerRecord.create(id(1), id(2), id(3), NOW);
        var changed = record.apply(CareerRecordChangeSet.none().withTitle("새 제목")
                .withPropertyValues(BusinessRecordFixture.values()).withStatus(CareerRecordStatus.VERIFIED), LATER);
        assertEquals("새 제목", changed.title());
        assertEquals(BusinessRecordFixture.values(), changed.propertyValues());
        assertEquals(CareerRecordStatus.VERIFIED, changed.status());
        assertEquals(2, changed.version());
        assertEquals(LATER, changed.updatedAt());
        assertEquals(record.id(), changed.id());
        assertEquals(record.userId(), changed.userId());
        assertEquals(record.categoryId(), changed.categoryId());
    }

    @Test
    void emptyAndEqualChangesAreNoOpsIncludingMetadata() {
        var record = BusinessRecordFixture.record();
        assertSame(record, record.apply(CareerRecordChangeSet.none(), LATER));
        assertSame(record, record.apply(CareerRecordChangeSet.none().withTitle(record.title())
                .withPropertyValues(new ArrayList<>(record.propertyValues())).withStatus(record.status()), LATER));
        assertEquals(7, record.version());
        assertEquals(NOW, record.updatedAt());
    }

    @Test
    void propertyClearIsBusinessChangeAndCollectionsAreImmutable() {
        var mutable = new ArrayList<PropertyValue>(BusinessRecordFixture.values());
        var changes = CareerRecordChangeSet.none().withPropertyValues(mutable);
        mutable.clear();
        assertEquals(15, changes.propertyValues().orElseThrow().size());
        var record = BusinessRecordFixture.record();
        assertThrows(UnsupportedOperationException.class, () -> record.propertyValues().clear());
        var cleared = record.apply(CareerRecordChangeSet.none().withPropertyValues(List.of()), LATER);
        assertEquals(List.of(), cleared.propertyValues());
        assertEquals(8, cleared.version());
    }

    @Test
    void businessComponentsHaveNoDocumentState() {
        assertEquals(Set.of("id", "userId", "categoryId", "title", "propertyValues", "status", "version", "updatedAt"),
                Arrays.stream(CareerRecord.class.getRecordComponents()).map(component -> component.getName())
                        .collect(Collectors.toSet()));
        assertEquals(Set.of("title", "propertyValues", "status"),
                Arrays.stream(CareerRecordChangeSet.class.getRecordComponents()).map(component -> component.getName())
                        .collect(Collectors.toSet()));
    }

    @Test
    void validatesBusinessInvariants() {
        assertThrows(IllegalArgumentException.class, () -> CareerRecord.create("invalid", id(2), id(3), NOW));
        var record = BusinessRecordFixture.record();
        assertThrows(IllegalArgumentException.class, () -> record.apply(
                CareerRecordChangeSet.none().withTitle("😀".repeat(301)), LATER));
        var sameProperty = record.propertyValues().getFirst();
        assertThrows(IllegalArgumentException.class, () -> record.apply(
                CareerRecordChangeSet.none().withPropertyValues(List.of(sameProperty, sameProperty)), LATER));
    }

    @Test
    void maximumSafeVersionKeepsNoOpsAndRejectsActualMutation() {
        var maximumVersion = new CareerRecord(id(1), id(2), id(3), "", List.of(),
                CareerRecordStatus.DRAFT, 9_007_199_254_740_991L, NOW);
        assertSame(maximumVersion, maximumVersion.apply(CareerRecordChangeSet.none(), LATER));
        assertSame(maximumVersion, maximumVersion.apply(CareerRecordChangeSet.none()
                .withTitle("").withPropertyValues(List.of()).withStatus(CareerRecordStatus.DRAFT), LATER));
        assertThrows(IllegalStateException.class, () -> maximumVersion.apply(
                CareerRecordChangeSet.none().withTitle("변경"), LATER));
        assertThrows(IllegalStateException.class, () -> maximumVersion.apply(
                CareerRecordChangeSet.none().withPropertyValues(BusinessRecordFixture.values()), LATER));
        assertThrows(IllegalStateException.class, () -> maximumVersion.apply(
                CareerRecordChangeSet.none().withStatus(CareerRecordStatus.VERIFIED), LATER));
        assertEquals(9_007_199_254_740_991L, maximumVersion.version());
        assertEquals(NOW, maximumVersion.updatedAt());
        var beforeMaximum = new CareerRecord(id(1), id(2), id(3), "", List.of(),
                CareerRecordStatus.DRAFT, 9_007_199_254_740_990L, NOW);
        assertEquals(9_007_199_254_740_991L, beforeMaximum.apply(
                CareerRecordChangeSet.none().withTitle("변경"), LATER).version());
    }
}

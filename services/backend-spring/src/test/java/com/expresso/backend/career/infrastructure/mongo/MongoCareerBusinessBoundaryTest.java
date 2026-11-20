package com.expresso.backend.career.infrastructure.mongo;

import static org.junit.jupiter.api.Assertions.*;

import java.math.BigDecimal;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.Date;
import java.util.Locale;

import com.expresso.backend.career.domain.BusinessRecordFixture;
import com.expresso.backend.career.domain.CareerRecord;
import com.expresso.backend.career.domain.CareerRecordStatus;
import com.expresso.backend.career.domain.DatePropertyValue;
import com.expresso.backend.career.domain.NumberPropertyValue;
import com.expresso.backend.career.domain.PropertyValue;
import com.expresso.backend.career.dto.CareerBusinessRecordData;
import org.bson.Document;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

class MongoCareerBusinessBoundaryTest {
    @Test
    void validDecimalBoundariesPreserveBsonDomainAndPlainWireValue() throws Exception {
        var cases = boundaryCases();
        for (var item : cases.get("validDecimals")) {
            var literal = item.asString();
            var value = new NumberPropertyValue(BusinessRecordFixture.id(12), new BigDecimal(literal));
            var stored = MongoCareerBusinessMappingTest.bsonRoundTrip(MongoCareerRecordWriter.writePropertyValue(value));
            assertEquals(value, MongoCareerRecordProjector.projectPropertyValue(stored));
            assertEquals(literal, value.value().toPlainString());
        }
    }

    @Test
    void invalidDecimalBoundariesAreRejectedByPureBusinessValue() throws Exception {
        for (var item : boundaryCases().get("invalidDecimals")) {
            assertThrows(IllegalArgumentException.class,
                    () -> new NumberPropertyValue(BusinessRecordFixture.id(12), new BigDecimal(item.asString())));
        }
    }

    @Test
    void businessMetadataUsesBsonMillisecondsBeforeAndAfterProjection() {
        var precise = Instant.parse("2026-10-06T01:02:03.123456789Z");
        var record = CareerRecord.create(BusinessRecordFixture.id(1), BusinessRecordFixture.id(2),
                BusinessRecordFixture.id(3), precise);
        assertEquals(Instant.parse("2026-10-06T01:02:03.123Z"), record.updatedAt());
        var physical = new Document("_id", record.id()).append("userId", record.userId())
                .append("categoryId", record.categoryId());
        physical.putAll(new MongoCareerRecordWriter().writeUpdate(record).get("$set", Document.class));
        assertEquals(record, new MongoCareerRecordProjector().project(MongoCareerBusinessMappingTest.bsonRoundTrip(physical)));
        assertEquals(Date.from(record.updatedAt()), physical.get("updatedAt"));
    }

    @Test
    void uuidAcceptanceMatchesSharedZodCases() throws Exception {
        var cases = boundaryCases();
        for (var id : cases.get("validUuids")) assertEquals(id.asString(), PropertyValue.requireUuid(id.asString(), "id"));
        for (var id : cases.get("invalidUuids")) {
            assertThrows(IllegalArgumentException.class, () -> PropertyValue.requireUuid(id.asString(), "id"));
        }
    }

    @Test
    void versionBoundariesMatchZodAndPreserveBsonAndDtoNumbers() throws Exception {
        var cases = boundaryCases();
        var mapper = JsonMapper.builder().build();
        for (var item : cases.get("validVersions")) {
            var record = recordAtVersion(item.asLong());
            var physical = new Document("_id", record.id()).append("userId", record.userId())
                    .append("categoryId", record.categoryId());
            physical.putAll(new MongoCareerRecordWriter().writeUpdate(record).get("$set", Document.class));
            var projected = new MongoCareerRecordProjector().project(MongoCareerBusinessMappingTest.bsonRoundTrip(physical));
            assertEquals(record, projected);
            var dto = mapper.readTree(mapper.writeValueAsString(CareerBusinessRecordData.from(projected)));
            assertEquals(item.asLong(), dto.get("version").asLong());
        }
        for (var item : cases.get("invalidVersions")) {
            assertThrows(IllegalArgumentException.class, () -> recordAtVersion(item.asLong()));
        }
    }

    @Test
    void timezoneBoundariesMatchZodWithoutChangingDateOrBsonValues() throws Exception {
        var cases = boundaryCases();
        for (var item : cases.get("validTimezones")) {
            var value = datetimeAtTimezone(item.asString());
            var stored = MongoCareerBusinessMappingTest.bsonRoundTrip(MongoCareerRecordWriter.writePropertyValue(value));
            assertEquals(value, MongoCareerRecordProjector.projectPropertyValue(stored));
            assertEquals(item.asString(), value.timezone());
        }
        for (var item : cases.get("invalidTimezones")) {
            assertThrows(IllegalArgumentException.class, () -> datetimeAtTimezone(item.asString()), item.asString());
        }
    }

    @Test
    void everySharedCanonicalTimezoneIsPreservedAndChangedCasingIsRejected() throws Exception {
        var policy = JsonMapper.builder().build().readTree(Files.readString(
                Path.of(System.getProperty("careerBusinessTimezonePolicy"))));
        for (var item : policy.get("identifiers")) {
            var timezone = item.asString();
            var value = datetimeAtTimezone(timezone);
            var stored = MongoCareerBusinessMappingTest.bsonRoundTrip(MongoCareerRecordWriter.writePropertyValue(value));
            assertEquals(value, MongoCareerRecordProjector.projectPropertyValue(stored));
            assertThrows(IllegalArgumentException.class,
                    () -> datetimeAtTimezone(timezone.toLowerCase(Locale.ROOT)), timezone);
        }
    }

    private static CareerRecord recordAtVersion(long version) {
        return new CareerRecord(BusinessRecordFixture.id(1), BusinessRecordFixture.id(2),
                BusinessRecordFixture.id(3), "", java.util.List.of(), CareerRecordStatus.DRAFT,
                version, Instant.parse("2026-10-06T01:02:03Z"));
    }

    private static DatePropertyValue datetimeAtTimezone(String timezone) {
        return new DatePropertyValue(BusinessRecordFixture.id(12), DatePropertyValue.Precision.DATETIME,
                "2026-10-06T10:02:03.123456789+09:00", "2026-10-06T02:02:03Z", timezone);
    }

    private static tools.jackson.databind.JsonNode boundaryCases() throws Exception {
        return JsonMapper.builder().build().readTree(Files.readString(
                Path.of(System.getProperty("careerBusinessBoundaryFixture"))));
    }
}

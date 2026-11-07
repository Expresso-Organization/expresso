package com.expresso.backend.career.infrastructure.mongo;

import static org.junit.jupiter.api.Assertions.*;

import java.nio.ByteBuffer;
import java.util.Date;
import java.util.List;
import java.util.Set;
import java.util.stream.Stream;

import com.expresso.backend.career.domain.BusinessRecordFixture;
import com.expresso.backend.career.domain.CareerRecordChangeSet;
import com.expresso.backend.career.domain.PropertyValue;
import org.bson.BsonBinaryReader;
import org.bson.BsonBinaryWriter;
import org.bson.Document;
import org.bson.codecs.DecoderContext;
import org.bson.codecs.DocumentCodec;
import org.bson.codecs.EncoderContext;
import org.bson.io.BasicOutputBuffer;
import org.bson.types.Decimal128;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;

class MongoCareerBusinessMappingTest {
    private final MongoCareerRecordWriter writer = new MongoCareerRecordWriter();
    private final MongoCareerRecordProjector projector = new MongoCareerRecordProjector();

    static Stream<PropertyValue> values() {
        return BusinessRecordFixture.values().stream();
    }

    @ParameterizedTest
    @MethodSource("values")
    void preservesCanonicalPropertyValuesThroughActualBsonCodec(PropertyValue value) {
        var stored = bsonRoundTrip(MongoCareerRecordWriter.writePropertyValue(value));
        assertEquals(value, MongoCareerRecordProjector.projectPropertyValue(stored));
        if (value.type().wireName().equals("number")) {
            assertInstanceOf(Decimal128.class, stored.get("value"));
            assertEquals("12345678901234567890.123400",
                    ((Decimal128) stored.get("value")).bigDecimalValue().toPlainString());
        }
    }

    @Test
    void projectsWithoutAnyDocumentFields() {
        var record = BusinessRecordFixture.record();
        var physical = new Document("_id", record.id()).append("userId", record.userId())
                .append("categoryId", record.categoryId()).append("title", record.title())
                .append("propertyValues", MongoCareerRecordWriter.writePropertyValues(record.propertyValues()))
                .append("status", record.status().wireName()).append("version", record.version())
                .append("updatedAt", Date.from(record.updatedAt()));
        assertEquals(record, projector.project(bsonRoundTrip(physical)));
    }

    @Test
    void ignoresDocumentFieldPresenceAndMalformedShapesWithoutMutatingSource() {
        for (var body : List.of("invalid body", 42, new Document("unexpected", List.of()), List.of("invalid"))) {
            var physical = physicalRecord().append("blockBody", body).append("bodyMd", 123)
                    .append("yjsState", new byte[] {1, 2}).append("documentVersion", "invalid");
            var before = bsonRoundTrip(physical);
            assertEquals(BusinessRecordFixture.record(), projector.project(physical));
            assertEquals(before, bsonRoundTrip(physical));
        }
        assertEquals(BusinessRecordFixture.record(), projector.project(physicalRecord().append("blockBody", null)));
    }

    @Test
    void emitsOnlyBusinessSetFieldsAndPreservesPhysicalDocumentAndOtherMetadata() {
        var physical = physicalRecord().append("blockBody", new Document("legacy", true))
                .append("bodyMd", "기존 본문").append("documentVersion", 99L)
                .append("snapshot", new byte[] {3}).append("updates", List.of(new Document("seq", 1)))
                .append("editorSchemaVersion", 2).append("origin", "interview")
                .append("createdAt", new Date(0)).append("deletedAt", null).append("properties", new Document());
        var before = new Document(physical);
        var changed = BusinessRecordFixture.record().apply(CareerRecordChangeSet.none().withTitle("변경된 제목"),
                BusinessRecordFixture.record().updatedAt().plusSeconds(10));
        var update = writer.writeUpdate(changed);
        assertEquals(Set.of("$set"), update.keySet());
        var fields = update.get("$set", Document.class);
        assertEquals(Set.of("title", "propertyValues", "status", "version", "updatedAt"), fields.keySet());
        fields.forEach(physical::put);
        assertEquals("변경된 제목", physical.get("title"));
        assertEquals(8L, physical.get("version"));
        assertEquals(Date.from(changed.updatedAt()), physical.get("updatedAt"));
        before.forEach((key, value) -> {
            if (!fields.containsKey(key)) assertEquals(value, physical.get(key), key);
        });
        assertFalse(fields.containsKey("_id"));
        assertFalse(fields.containsKey("userId"));
        assertFalse(fields.containsKey("categoryId"));
    }

    @Test
    void rejectsInvalidBusinessDataButDoesNotRequireBodyAsAnInvariant() {
        assertThrows(IllegalStateException.class, () -> projector.project(physicalRecord().append("propertyValues", null)));
        assertThrows(IllegalStateException.class, () -> projector.project(physicalRecord().append("version", 1.5)));
        assertThrows(IllegalStateException.class, () -> MongoCareerRecordProjector.projectPropertyValue(
                new Document("propertyDefinitionId", BusinessRecordFixture.id(12)).append("type", "number")
                        .append("value", Decimal128.NaN)));
        assertThrows(IllegalStateException.class, () -> MongoCareerRecordProjector.projectPropertyValue(
                new Document("propertyDefinitionId", BusinessRecordFixture.id(12)).append("type", "number")
                        .append("value", "1.23")));
    }

    private Document physicalRecord() {
        var record = BusinessRecordFixture.record();
        return new Document("_id", record.id()).append("userId", record.userId())
                .append("categoryId", record.categoryId()).append("title", record.title())
                .append("propertyValues", MongoCareerRecordWriter.writePropertyValues(record.propertyValues()))
                .append("status", record.status().wireName()).append("version", record.version())
                .append("updatedAt", Date.from(record.updatedAt()));
    }

    static Document bsonRoundTrip(Document value) {
        var codec = new DocumentCodec();
        try (var output = new BasicOutputBuffer(); var writer = new BsonBinaryWriter(output)) {
            codec.encode(writer, value, EncoderContext.builder().build());
            try (var reader = new BsonBinaryReader(ByteBuffer.wrap(output.toByteArray()))) {
                return codec.decode(reader, DecoderContext.builder().build());
            }
        }
    }
}

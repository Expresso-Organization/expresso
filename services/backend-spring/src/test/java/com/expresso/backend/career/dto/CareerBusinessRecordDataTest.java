package com.expresso.backend.career.dto;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.nio.file.Files;
import java.nio.file.Path;

import com.expresso.backend.career.domain.BusinessRecordFixture;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

class CareerBusinessRecordDataTest {
    @Test
    void serializesExactlyTheSharedZodAndOpenApiBusinessFixture() throws Exception {
        var mapper = JsonMapper.builder().findAndAddModules().build();
        var expected = mapper.readTree(Files.readString(Path.of(System.getProperty("careerBusinessFixture"))));
        var response = new CareerBusinessRecordData.Response(CareerBusinessRecordData.from(BusinessRecordFixture.record()));
        assertEquals(expected, mapper.readTree(mapper.writeValueAsString(response)));
    }
}

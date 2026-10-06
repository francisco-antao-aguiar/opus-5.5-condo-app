package com.condo.maintenance;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;
import java.util.List;

/** Small JSON columns stored as text, so the schema stays portable between H2 and PostgreSQL. */
final class JsonConverters {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private JsonConverters() {
    }

    @Converter
    static class RecurrenceJson implements AttributeConverter<Recurrence, String> {

        @Override
        public String convertToDatabaseColumn(Recurrence value) {
            return write(value);
        }

        @Override
        public Recurrence convertToEntityAttribute(String json) {
            return read(json, new TypeReference<Recurrence>() { });
        }
    }

    @Converter
    static class StringListJson implements AttributeConverter<List<String>, String> {

        @Override
        public String convertToDatabaseColumn(List<String> value) {
            return write(value == null ? List.of() : value);
        }

        @Override
        public List<String> convertToEntityAttribute(String json) {
            return json == null ? List.of() : read(json, new TypeReference<List<String>>() { });
        }
    }

    private static String write(Object value) {
        try {
            return MAPPER.writeValueAsString(value);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
    }

    private static <T> T read(String json, TypeReference<T> type) {
        try {
            return MAPPER.readValue(json, type);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Corrupt JSON column: " + json, e);
        }
    }
}

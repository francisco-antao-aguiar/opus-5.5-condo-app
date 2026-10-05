package com.condo.common.error;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;

/**
 * Business error with a stable machine-readable {@code code}. Rendered as RFC 7807 problem detail
 * by {@link GlobalExceptionHandler}. Clients branch on {@code code}, never on the message.
 */
public class ApiException extends RuntimeException {

    private final HttpStatus status;
    private final String code;
    private final List<Map<String, String>> fieldErrors;
    /** Extra machine-readable payload rendered as top-level problem properties (e.g. {@code duplicate}). */
    private final Map<String, Object> properties = new LinkedHashMap<>();

    public ApiException(HttpStatus status, String code, String message) {
        this(status, code, message, List.of());
    }

    private ApiException(HttpStatus status, String code, String message, List<Map<String, String>> fieldErrors) {
        super(message);
        this.status = status;
        this.code = code;
        this.fieldErrors = fieldErrors;
    }

    /** A validation failure on one field that Bean Validation can't express (depends on "now", other rows…). */
    public static ApiException invalidField(String field, String message) {
        return new ApiException(HttpStatus.BAD_REQUEST, ErrorCodes.VALIDATION_FAILED, "Some fields are invalid.",
                List.of(Map.of("field", field, "message", message)));
    }

    public static ApiException notFound(String what) {
        return new ApiException(HttpStatus.NOT_FOUND, ErrorCodes.NOT_FOUND, what + " not found.");
    }

    public static ApiException badRequest(String code, String message) {
        return new ApiException(HttpStatus.BAD_REQUEST, code, message);
    }

    public static ApiException forbidden(String code, String message) {
        return new ApiException(HttpStatus.FORBIDDEN, code, message);
    }

    public static ApiException conflict(String code, String message) {
        return new ApiException(HttpStatus.CONFLICT, code, message);
    }

    public static ApiException unauthorized(String code, String message) {
        return new ApiException(HttpStatus.UNAUTHORIZED, code, message);
    }

    public ApiException with(String property, Object value) {
        properties.put(property, value);
        return this;
    }

    public HttpStatus getStatus() {
        return status;
    }

    public String getCode() {
        return code;
    }

    public List<Map<String, String>> getFieldErrors() {
        return fieldErrors;
    }

    public Map<String, Object> getProperties() {
        return properties;
    }
}

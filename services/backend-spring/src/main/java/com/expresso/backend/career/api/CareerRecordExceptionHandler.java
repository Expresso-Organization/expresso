package com.expresso.backend.career.api;

import java.util.UUID;

import com.mongodb.MongoException;
import jakarta.servlet.http.HttpServletRequest;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import com.expresso.backend.career.application.CareerRecordCategoryNotAllowedException;
import com.expresso.backend.career.application.CareerRecordDataIntegrityException;
import com.expresso.backend.career.application.CareerRecordIdempotencyConflictException;
import com.expresso.backend.career.application.CareerRecordNotFoundException;
import com.expresso.backend.career.application.CareerRecordPreconditionFailedException;
import com.expresso.backend.career.application.CareerRecordValidationException;

@RestControllerAdvice(assignableTypes = CareerRecordController.class)
public class CareerRecordExceptionHandler {

	@ExceptionHandler({ CareerRecordRequestValidationException.class,
			CareerRecordCategoryNotAllowedException.class,
			CareerRecordValidationException.class,
			HttpMessageNotReadableException.class })
	ResponseEntity<ApiErrorResponse> badRequest(HttpServletRequest request) {
		return error(request, HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "Request validation failed");
	}

	@ExceptionHandler(CareerRecordIdempotencyConflictException.class)
	ResponseEntity<ApiErrorResponse> conflict(HttpServletRequest request) {
		return error(request, HttpStatus.CONFLICT, "CONFLICT", "Request conflicts with current state");
	}

	@ExceptionHandler(CareerRecordNotFoundException.class)
	ResponseEntity<ApiErrorResponse> notFound(HttpServletRequest request) {
		return error(request, HttpStatus.NOT_FOUND, "NOT_FOUND", "Resource not found");
	}

	@ExceptionHandler(CareerRecordDataIntegrityException.class)
	ResponseEntity<ApiErrorResponse> internalError(HttpServletRequest request) {
		return error(request, HttpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "Internal server error");
	}

	@ExceptionHandler(CareerRecordPreconditionFailedException.class)
	ResponseEntity<ApiErrorResponse> preconditionFailed(HttpServletRequest request) {
		return error(request, HttpStatus.PRECONDITION_FAILED, "PRECONDITION_FAILED", "Precondition failed");
	}

	@ExceptionHandler(DataIntegrityViolationException.class)
	ResponseEntity<ApiErrorResponse> mongoWriteConflict(
			HttpServletRequest request,
			DataIntegrityViolationException exception) {
		if (isWriteConflict(exception)) {
			return preconditionFailed(request);
		}
		throw exception;
	}

	private static boolean isWriteConflict(Throwable exception) {
		for (var cause = exception; cause != null; cause = cause.getCause()) {
			if (cause instanceof MongoException mongoException && mongoException.getCode() == 112) {
				return true;
			}
		}
		return false;
	}

	private static ResponseEntity<ApiErrorResponse> error(
			HttpServletRequest request,
			HttpStatus status,
			String code,
			String message) {
		var requestId = request.getRequestId();
		if (requestId == null || requestId.isBlank()) {
			requestId = UUID.randomUUID().toString();
		}
		return ResponseEntity.status(status)
				.header("x-request-id", requestId)
				.body(new ApiErrorResponse(new ApiError(code, message, requestId)));
	}

	record ApiErrorResponse(ApiError error) {
	}

	record ApiError(String code, String message, String requestId) {
	}

}

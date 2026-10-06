package com.expresso.backend.career.application;

public final class CareerCommandException extends RuntimeException {
    private final int status;
    private final String code;
    public CareerCommandException(int status, String code) {
        super(code); this.status = status; this.code = code;
    }
    public int status() { return status; }
    public String code() { return code; }
    public static CareerCommandException missing() { return new CareerCommandException(404, "NOT_FOUND"); }
    public static CareerCommandException stale() { return new CareerCommandException(412, "VERSION_MISMATCH"); }
}

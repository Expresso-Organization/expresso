package com.expresso.backend.career.application;

public final class CareerCommandException extends RuntimeException {
    private final int status;
    private final String code;
    private final java.util.Map<String,Object> details;
    public CareerCommandException(int status, String code) {
        this(status,code,java.util.Map.of());
    }
    public CareerCommandException(int status,String code,java.util.Map<String,Object> details) {
        super(code); this.status=status; this.code=code; this.details=java.util.Map.copyOf(details);
    }
    public int status() { return status; }
    public String code() { return code; }
    public java.util.Map<String,Object> details() {return details;}
    public static CareerCommandException missing() { return new CareerCommandException(404, "NOT_FOUND"); }
    public static CareerCommandException stale() { return new CareerCommandException(412, "VERSION_MISMATCH"); }
}

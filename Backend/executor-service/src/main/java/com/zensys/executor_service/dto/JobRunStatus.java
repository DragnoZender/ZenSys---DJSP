package com.zensys.executor_service.dto;

public enum JobRunStatus {
    PENDING,
    RUNNING,
    SUCCESS,
    FAILED,
    TIMEOUT,
    CANCELLED,
    EXECUTOR_DIED
}

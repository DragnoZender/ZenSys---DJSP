package com.zensys.consumer_service.model;

public enum JobRunStatus {
    PENDING,
    QUEUED,
    RUNNING,
    SUCCESS,
    FAILED,
    TIMEOUT,
    CANCELLED,
    EXECUTOR_DIED
}

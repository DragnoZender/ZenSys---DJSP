package com.zensys.consumer_service.model;

public enum JobRunStatus {
    PENDING,
    QUEUED,
    RUNNING,
    SUCCESS,
    FAILED,
    TIMEOUT,
    CANCELLED,
    EXECUTOR_DIED;

    public boolean isTerminal() {
        return this == SUCCESS || this == FAILED || this == TIMEOUT
                || this == CANCELLED || this == EXECUTOR_DIED;
    }
}

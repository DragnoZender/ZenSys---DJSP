package com.zensys.job_consumer_service.dto;

public enum JobRunStatus { // status of job runs
    PENDING,
    RUNNING,
    SUCCESS,
    FAILED,
    TIMEOUT,
    CANCELLED,
    EXECUTOR_DIED
}

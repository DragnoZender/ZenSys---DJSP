package com.zensys.job_search_service.model;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Entity
@Table(
        name = "jobs",
        indexes = {
                @Index(name = "idx_schedule_time", columnList = "schedule_time"),
                @Index(name = "idx_watcher_poll", columnList = "next_run_time, status, last_polled_time")
        }
)
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Job {

    @Id
    @Column(length = 26, nullable = false, updatable = false)
    private String id;

    @Column(nullable = false)
    private String name;

    @Enumerated(EnumType.STRING)
    @Column(name = "schedule_type", nullable = false)
    private ScheduleType scheduleType;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private JobStatus status;

    @Column(name = "schedule_time")
    private Instant scheduleTime;

    @Column(name = "next_run_time")
    private Instant nextRunTime;

    @Column(name = "last_polled_time")
    private Instant lastPolledTime;

    @Column(name = "cron_expression")
    private String cronExpression;

    @Column(columnDefinition = "jsonb")
    private String payload;

    @Column(nullable = false)
    private Integer retries;

    @Column(columnDefinition = "jsonb")
    private String meta;
}

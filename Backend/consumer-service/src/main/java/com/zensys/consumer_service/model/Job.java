package com.zensys.consumer_service.model;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.OneToMany;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Entity
@Table(
        name = "jobs",
        indexes = {
                @Index(name = "idx_schedule_time", columnList = "schedule_time")
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

    @Column(name = "schedule_time", nullable = false)
    private Instant scheduleTime;

    @Column(name = "cron_expression")
    private String cronExpression;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    private String payload;

    @Column(nullable = false)
    @Builder.Default
    private Integer retries = 3;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    private String meta;

    @OneToMany(mappedBy = "job", 
    cascade = CascadeType.ALL, 
    orphanRemoval = true)
    @Builder.Default
    private List<JobRun> jobRuns = new ArrayList<>();
}

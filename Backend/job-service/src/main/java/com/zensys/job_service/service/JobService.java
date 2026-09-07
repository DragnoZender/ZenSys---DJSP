package com.zensys.job_service.service;

import java.time.Instant;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.support.CronExpression;
import org.springframework.stereotype.Service;

import com.github.f4b6a3.ulid.UlidCreator;
import com.zensys.job_service.dto.CreateJobRequest;
import com.zensys.job_service.dto.UpdateJobRequest;
import com.zensys.job_service.event.JobCommand;
import com.zensys.job_service.kafka.JobProducer;
import com.zensys.job_service.model.JobCommandType;
import com.zensys.job_service.model.JobStatus;
import com.zensys.job_service.model.ScheduleType;

@Service
public class JobService {

    private static final ZoneId DEFAULT_ZONE = ZoneId.of("Asia/Kolkata");

    @Autowired
    private JobProducer jobProducer;

    public String createJob(CreateJobRequest request) {

        String jobID = UlidCreator.getUlid().toString();
        String eventId = UlidCreator.getUlid().toString();

        Instant nextRunTime = calculateNextRunTime(
                request.getScheduleType(),
                request.getScheduleTime(),
                request.getCronExpression(),
                request.getMeta()
        );

        JobCommand command = JobCommand.builder()
        .type(JobCommandType.CREATE)
        .eventId(eventId)
        .jobId(jobID)
        .name(request.getName())
        .scheduleType(request.getScheduleType())
        .status(JobStatus.SCHEDULED)
        .scheduleTime(request.getScheduleTime())
        .cronExpression(request.getCronExpression())
        .payload(request.getPayload())
        .retries(request.getRetries() != null ? request.getRetries() : 3)
        .meta(request.getMeta())
        .nextRunTime(nextRunTime)
        .lastPolledTime(null)
        .build();

        jobProducer.sendJobCommand(command);

        return "Job created successfully";
    }

    public String updateJob(String jobId, UpdateJobRequest request) {
 
        String eventId = UlidCreator.getUlid().toString();

        Instant nextRunTime = calculateNextRunTime(
                request.getScheduleType(),
                request.getScheduleTime(),
                request.getCronExpression(),
                request.getMeta()
        );

        JobCommand command = JobCommand.builder()
            .type(JobCommandType.UPDATE)
            .eventId(eventId)
            .jobId(jobId)
            .name(request.getName())
            .scheduleType(request.getScheduleType())
            .status(request.getStatus())
            .scheduleTime(request.getScheduleTime())
            .cronExpression(request.getCronExpression())
            .payload(request.getPayload())
            .retries(request.getRetries() != null? request.getRetries(): 3)
            .meta(request.getMeta())
            .nextRunTime(nextRunTime)
            .build();

        jobProducer.sendJobCommand(command);

        return "Job updated successfully";
    }

    private Instant calculateNextRunTime(ScheduleType scheduleType, Instant scheduleTime, String cronExpression, String meta) {
        if (scheduleType == null) {
            return scheduleTime;
        }
        switch (scheduleType) {
            case ONCE:
                return scheduleTime != null ? scheduleTime : Instant.now();

            case CRON:
                if (cronExpression != null && !cronExpression.isBlank()) {
                    String expr = cronExpression.trim();
                    String[] parts = expr.split("\\s+");
                    if (parts.length == 5) {
                        expr = "0 " + expr;
                    }
                    CronExpression cron = CronExpression.parse(expr);
                    ZoneId zoneId = parseZoneId(meta);
                    ZonedDateTime next = cron.next(ZonedDateTime.now(zoneId));
                    return next != null ? next.toInstant() : null;
                }
                return null;

            case INTERVAL:
                if (scheduleTime != null && scheduleTime.isAfter(Instant.now())) {
                    return scheduleTime;
                }
                long intervalSeconds = parseIntervalSeconds(meta);
                return Instant.now().plusSeconds(intervalSeconds > 0 ? intervalSeconds : 60);

            default:
                return scheduleTime;
        }
    }

    private long parseIntervalSeconds(String meta) {
        if (meta == null || meta.isBlank()) {
            return 60;
        }
        Pattern pattern = Pattern.compile("\"(?:intervalSeconds|interval)\"\\s*:\\s*(\\d+)");
        Matcher matcher = pattern.matcher(meta);
        if (matcher.find()) {
            try {
                return Long.parseLong(matcher.group(1));
            } catch (NumberFormatException ignored) {
            }
        }
        return 60;
    }

    private ZoneId parseZoneId(String meta) {
        if (meta != null && !meta.isBlank()) {
            Pattern pattern = Pattern.compile("\"(?:timezone|timeZone)\"\\s*:\\s*\"([^\"]+)\"");
            Matcher matcher = pattern.matcher(meta);
            if (matcher.find()) {
                try {
                    return ZoneId.of(matcher.group(1).trim());
                } catch (Exception ignored) {
                }
            }
        }
        return DEFAULT_ZONE;
    }
    
    public String deleteJob(String jobId) {

        String eventId = UlidCreator.getUlid().toString();

        JobCommand command = JobCommand.builder()
            .type(JobCommandType.DELETE)
            .eventId(eventId)
            .jobId(jobId)
            .build();

        jobProducer.sendJobCommand(command);

        return "Job deleted successfully";
    }
}

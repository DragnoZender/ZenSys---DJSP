package com.zensys.watcher_service.service;

import java.time.Instant;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.PageRequest;
import org.springframework.scheduling.support.CronExpression;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.github.f4b6a3.ulid.UlidCreator;
import com.zensys.watcher_service.event.JobRunEvent;
import com.zensys.watcher_service.kafka.RunProducer;
import com.zensys.watcher_service.model.Job;
import com.zensys.watcher_service.model.JobStatus;
import com.zensys.watcher_service.model.ScheduleType;
import com.zensys.watcher_service.repository.JobRepository;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Slf4j
@Service
@RequiredArgsConstructor
public class JobWatcherService {

    private static final ZoneId DEFAULT_ZONE = ZoneId.of("Asia/Kolkata");

    private final JobRepository jobRepository;
    private final RunProducer runProducer;

    @Value("${watcher.batch-size:1000}")
    private int batchSize;

    @Value("${watcher.lock-threshold-seconds:30}")
    private long lockThresholdSeconds;

    @Transactional
    public void pollAndDispatchDueJobs() {
        Instant now = Instant.now();
        Instant threshold = now.minusSeconds(lockThresholdSeconds);

        List<Job> dueJobs = jobRepository.findDueJobs(now, threshold, PageRequest.of(0, batchSize));
        
        System.out.println("\n\n jobs pulled count = "+dueJobs.size() + "\n\n");
        
        if (dueJobs.isEmpty()) {
            log.trace("No due jobs found to dispatch at {}", now);
            return;
        }

        
        log.info("Found {} due job(s) for execution at {}", dueJobs.size(), now);

        for (Job job : dueJobs) {
            try {
                String runId = UlidCreator.getUlid().toString();

                JobRunEvent runEvent = JobRunEvent.builder()
                        .runId(runId)
                        .jobId(job.getId())
                        .payload(job.getPayload())
                        .attempt(1)
                        .scheduledAt(job.getNextRunTime())
                        .maxRetries(job.getRetries())
                        .build();

                // 1. Publish execution command to Kafka 'run' topic
                runProducer.sendRunEvent(runEvent);

                // 2. Advance job schedule and status based on schedule type
                advanceJobSchedule(job, now);

                // 3. Mark last polled timestamp and persist changes
                job.setLastPolledTime(now);
                jobRepository.save(job);

                log.info("Successfully dispatched job '{}' (id={}) with runId={}, nextRunTime={}",
                        job.getName(), job.getId(), runId, job.getNextRunTime());
            } catch (Exception e) {
                log.error("Failed to dispatch due job '{}' (id={}): {}", job.getName(), job.getId(), e.getMessage(), e);
                if (Thread.currentThread().isInterrupted()) {
                    log.warn("Watcher polling thread interrupted. Stopping batch dispatch.");
                    break;
                }
            }
        }
    }

    private void advanceJobSchedule(Job job, Instant now) {
        ScheduleType type = job.getScheduleType();
        if (type == null) {
            type = ScheduleType.ONCE;
        }

        switch (type) {
            case ONCE -> {
                // One-time job has been triggered: transition to RUNNING and clear nextRunTime
                job.setStatus(JobStatus.RUNNING);
                job.setNextRunTime(null);
            }
            case CRON -> {
                // Recurring cron job: advance nextRunTime to the next occurrence and mark
                // RUNNING
                Instant nextRun = calculateNextCronTime(job.getCronExpression(), job.getMeta(), now);
                job.setNextRunTime(nextRun);
                job.setStatus(JobStatus.RUNNING);
            }
            case INTERVAL -> {
                // Interval job: advance nextRunTime by interval seconds and mark RUNNING
                long intervalSeconds = parseIntervalSeconds(job.getMeta());
                job.setNextRunTime(now.plusSeconds(intervalSeconds > 0 ? intervalSeconds : 60));
                job.setStatus(JobStatus.RUNNING);
            }
        }
    }

    private Instant calculateNextCronTime(String cronExpression, String meta, Instant now) {
        if (cronExpression == null || cronExpression.isBlank()) {
            return null;
        }
        try {
            String expr = cronExpression.trim();
            String[] parts = expr.split("\\s+");
            if (parts.length == 5) {
                expr = "0 " + expr; // Spring CronExpression requires 6 fields (sec min hr dom mon dow)
            }
            CronExpression cron = CronExpression.parse(expr);
            ZoneId zoneId = parseZoneId(meta);
            ZonedDateTime next = cron.next(ZonedDateTime.ofInstant(now, zoneId));
            return next != null ? next.toInstant() : null;
        } catch (Exception e) {
            log.error("Failed to calculate next run for cron expression '{}': {}", cronExpression, e.getMessage());
            return null;
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
}

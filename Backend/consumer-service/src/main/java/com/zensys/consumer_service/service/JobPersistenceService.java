package com.zensys.consumer_service.service;

import java.time.LocalDateTime;

import org.springframework.stereotype.Service;

import com.zensys.consumer_service.event.JobCommand;
import com.zensys.consumer_service.model.Job;
import com.zensys.consumer_service.model.ProcessedCommand;
import com.zensys.consumer_service.repository.JobRepository;
import com.zensys.consumer_service.repository.ProcessedCommandRepository;

import jakarta.transaction.Transactional;
import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class JobPersistenceService {

    
    private final JobRepository jobRepository;
    private final ProcessedCommandRepository processedCommandRepository;


    @Transactional
    public void processJobCommand(JobCommand command) {

        if (processedCommandRepository.existsById(command.getEventId())) {
            
            return; //Ensuring Idempotency
        }

        switch (command.getType()) {

            case CREATE:
                saveJob(command);
                break;

            case UPDATE:
                updateJob(command);
                break;

            case DELETE:
                deleteJob(command);
                break;

            default:
                throw new IllegalArgumentException(
                        "Unknown job command: " + command.getType()
                );
        }

        processedCommandRepository.save(
                        ProcessedCommand.builder()
                        .eventId(command.getEventId())
                        .processedAt(LocalDateTime.now())
                        .build()
        );
    }
        

    private void saveJob(JobCommand command) {

        Job job = Job.builder()
                .id(command.getJobId())
                .name(command.getName())
                .scheduleType(command.getScheduleType())
                .status(command.getStatus())
                .scheduleTime(command.getScheduleTime())
                .nextRunTime(command.getNextRunTime())
                .lastPolledTime(command.getLastPolledTime())
                .cronExpression(command.getCronExpression())
                .payload(command.getPayload())
                .retries(command.getRetries())
                .meta(command.getMeta())
                .build();

        jobRepository.save(job);
    }

    private void updateJob(JobCommand command) {

        Job job = jobRepository.findById(command.getJobId())
                .orElseThrow(() ->
                        new RuntimeException(
                                "Job not found: " + command.getJobId()
                        )
                );

        job.setName(command.getName());
        job.setScheduleType(command.getScheduleType());
        job.setStatus(command.getStatus());
        job.setScheduleTime(command.getScheduleTime());
        if (command.getNextRunTime() != null) {
            job.setNextRunTime(command.getNextRunTime());
        }
        if (command.getLastPolledTime() != null) {
            job.setLastPolledTime(command.getLastPolledTime());
        }
        job.setCronExpression(command.getCronExpression());
        job.setPayload(command.getPayload());
        job.setRetries(command.getRetries());
        job.setMeta(command.getMeta());

        jobRepository.save(job);
    }

    private void deleteJob(JobCommand command) {

        jobRepository.deleteById(command.getJobId());
    }
}

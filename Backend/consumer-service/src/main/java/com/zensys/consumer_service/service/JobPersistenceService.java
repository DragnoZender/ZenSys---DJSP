package com.zensys.consumer_service.service;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import com.zensys.consumer_service.event.JobCommand;
import com.zensys.consumer_service.model.Job;
import com.zensys.consumer_service.repository.JobRepository;

import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class JobPersistenceService {

    @Autowired
    private JobRepository jobRepository;

    public void saveJob(JobCommand command) {

        Job job = Job.builder()
                .id(command.getJobId())
                .name(command.getName())
                .scheduleType(command.getScheduleType())
                .status(command.getStatus())
                .scheduleTime(command.getScheduleTime())
                .cronExpression(command.getCronExpression())
                .payload(command.getPayload())
                .retries(command.getRetries())
                .meta(command.getMeta())
                .build();

        jobRepository.save(job);
    }

    public void updateJob(JobCommand command) {

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
        job.setCronExpression(command.getCronExpression());
        job.setPayload(command.getPayload());
        job.setRetries(command.getRetries());
        job.setMeta(command.getMeta());

        jobRepository.save(job);
    }

    public void deleteJob(JobCommand command) {

        jobRepository.deleteById(command.getJobId());
    }
}

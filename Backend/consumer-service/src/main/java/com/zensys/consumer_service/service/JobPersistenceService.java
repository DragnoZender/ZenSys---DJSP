package com.zensys.consumer_service.service;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import com.zensys.consumer_service.event.JobCreatedEvent;
import com.zensys.consumer_service.model.Job;
import com.zensys.consumer_service.repository.JobRepository;

import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class JobPersistenceService {

    @Autowired
    private JobRepository jobRepository;

    public void saveJob(JobCreatedEvent event) {

        Job job = Job.builder()
                .name(event.getName())
                .scheduleType(event.getScheduleType())
                .status(event.getStatus())
                .scheduleTime(event.getScheduleTime())
                .cronExpression(event.getCronExpression())
                .payload(event.getPayload())
                .retries(event.getRetries())
                .meta(event.getMeta())
                .build();

        jobRepository.save(job);
    }
}

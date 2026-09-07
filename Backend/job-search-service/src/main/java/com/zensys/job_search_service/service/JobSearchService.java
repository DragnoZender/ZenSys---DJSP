package com.zensys.job_search_service.service;

import java.util.List;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import com.zensys.job_search_service.dto.JobResponse;
import com.zensys.job_search_service.model.Job;
import com.zensys.job_search_service.repository.JobRepository;

@Service
public class JobSearchService {


    @Autowired
    private JobRepository jobRepository;

    public JobResponse getJobById(String jobId) {

        Job job = jobRepository.findById(jobId)
                .orElseThrow(() ->
                        new RuntimeException(
                                "Job not found: " + jobId
                        )
                );

        return mapToResponse(job);
    }

    public List<JobResponse> getAllJobs() {

        return jobRepository.findAll()
                .stream()
                .map(this::mapToResponse)
                .toList();
    }


    private JobResponse mapToResponse(Job job) {

        return JobResponse.builder()
                .jobId(job.getId())
                .name(job.getName())
                .scheduleType(job.getScheduleType())
                .status(job.getStatus())
                .scheduleTime(job.getScheduleTime())
                .cronExpression(job.getCronExpression())
                .payload(job.getPayload())
                .retries(job.getRetries())
                .meta(job.getMeta())
                .nextRunTime(job.getNextRunTime())
                .lastPolledTime(job.getLastPolledTime())
                .build();
    }
}

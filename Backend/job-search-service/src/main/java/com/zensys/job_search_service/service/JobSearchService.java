package com.zensys.job_search_service.service;

import java.util.List;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import com.zensys.job_search_service.dto.JobResponse;
import com.zensys.job_search_service.dto.JobRunResponse;
import com.zensys.job_search_service.model.Job;
import com.zensys.job_search_service.model.JobRun;
import com.zensys.job_search_service.model.JobRunStatus;
import com.zensys.job_search_service.model.JobStatus;
import com.zensys.job_search_service.model.ScheduleType;
import com.zensys.job_search_service.repository.JobRepository;
import com.zensys.job_search_service.repository.JobRunRepository;

@Service
public class JobSearchService {

    @Autowired
    private JobRepository jobRepository;

    @Autowired
    private JobRunRepository jobRunRepository;

    public JobResponse getJobById(String jobId) {
        Job job = jobRepository.findById(jobId)
                .orElseThrow(() -> new RuntimeException("Job not found: " + jobId));

        return mapToResponse(job);
    }

    public List<JobResponse> getAllJobs() {
        return jobRepository.findAll()
                .stream()
                .map(this::mapToResponse)
                .toList();
    }

    public List<JobResponse> getJobs(JobStatus status, ScheduleType scheduleType) {
        List<Job> jobs;
        if (status != null && scheduleType != null) {
            jobs = jobRepository.findByStatusAndScheduleType(status, scheduleType);
        } else if (status != null) {
            jobs = jobRepository.findByStatus(status);
        } else if (scheduleType != null) {
            jobs = jobRepository.findByScheduleType(scheduleType);
        } else {
            jobs = jobRepository.findAll();
        }

        return jobs.stream().map(this::mapToResponse).toList();
    }

    public List<JobRunResponse> getRunsForJob(String jobId) {
        if (!jobRepository.existsById(jobId)) {
            throw new RuntimeException("Job not found: " + jobId);
        }

        return jobRunRepository.findByJob_IdOrderByStartTimeDesc(jobId)
                .stream()
                .map(this::mapToRunResponse)
                .toList();
    }

    public JobRunResponse getRunByRunId(String runId) {
        JobRun run = jobRunRepository.findByRunId(runId)
                .orElseThrow(() -> new RuntimeException("Job run not found: " + runId));

        return mapToRunResponse(run);
    }

    public List<JobRunResponse> getAllRuns(JobRunStatus status) {
        List<JobRun> runs = (status != null)
                ? jobRunRepository.findByStatus(status)
                : jobRunRepository.findAll();

        return runs.stream().map(this::mapToRunResponse).toList();
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

    private JobRunResponse mapToRunResponse(JobRun run) {
        return JobRunResponse.builder()
                .id(run.getId())
                .runId(run.getRunId())
                .jobId(run.getJob() != null ? run.getJob().getId() : null)
                .status(run.getStatus())
                .startTime(run.getStartTime())
                .endTime(run.getEndTime())
                .modificationTime(run.getModificationTime())
                .executorId(run.getExecutorId())
                .attemptNumber(run.getAttemptNumber())
                .executionTimeMs(run.getExecutionTimeMs())
                .errorMsg(run.getErrorMsg())
                .build();
    }
}

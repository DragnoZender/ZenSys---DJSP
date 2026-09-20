package com.zensys.job_search_service.controller;

import java.util.List;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.zensys.job_search_service.dto.JobResponse;
import com.zensys.job_search_service.dto.JobRunResponse;
import com.zensys.job_search_service.model.JobRunStatus;
import com.zensys.job_search_service.model.JobStatus;
import com.zensys.job_search_service.model.ScheduleType;
import com.zensys.job_search_service.service.JobSearchService;

@RestController
@RequestMapping("/jobs")
public class JobSearchController {

    @Autowired
    private JobSearchService jobSearchService;

    @GetMapping("/{jobId}")
    public ResponseEntity<JobResponse> getJob(@PathVariable String jobId) {
        return ResponseEntity.ok(jobSearchService.getJobById(jobId));
    }

    @GetMapping
    public ResponseEntity<List<JobResponse>> getJobs(
            @RequestParam(required = false) JobStatus status,
            @RequestParam(required = false) ScheduleType scheduleType) {
        return ResponseEntity.ok(jobSearchService.getJobs(status, scheduleType));
    }

    @GetMapping("/{jobId}/runs")
    public ResponseEntity<List<JobRunResponse>> getRunsForJob(@PathVariable String jobId) {
        return ResponseEntity.ok(jobSearchService.getRunsForJob(jobId));
    }

    @GetMapping("/runs/{runId}")
    public ResponseEntity<JobRunResponse> getRunByRunId(@PathVariable String runId) {
        return ResponseEntity.ok(jobSearchService.getRunByRunId(runId));
    }

    @GetMapping("/runs")
    public ResponseEntity<List<JobRunResponse>> getAllRuns(
            @RequestParam(required = false) JobRunStatus status) {
        return ResponseEntity.ok(jobSearchService.getAllRuns(status));
    }
}


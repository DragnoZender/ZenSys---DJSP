package com.zensys.job_search_service.controller;

import java.util.List;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.zensys.job_search_service.dto.JobResponse;
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
    public ResponseEntity<List<JobResponse>> getAllJobs() {
        return ResponseEntity.ok(jobSearchService.getAllJobs());
    }
}

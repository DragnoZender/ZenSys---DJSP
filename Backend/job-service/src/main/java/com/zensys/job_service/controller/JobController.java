package com.zensys.job_service.controller;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.zensys.job_service.dto.CreateJobRequest;
import com.zensys.job_service.dto.UpdateJobRequest;
import com.zensys.job_service.service.JobService;


@RestController
@RequestMapping("/jobs")
public class JobController {

    @Autowired
    private JobService jobService;

    @PostMapping("/create")
    ResponseEntity<String> createJob(@RequestBody CreateJobRequest request) {
        return ResponseEntity.ok(jobService.createJob(request));
    }

    @PutMapping("/{jobId}")
    public ResponseEntity<String> updateJob(@PathVariable String jobId, @RequestBody UpdateJobRequest request) {

        return ResponseEntity.ok( jobService.updateJob(jobId, request));
    }

    @RequestMapping("/delete/{jobId}")
    public ResponseEntity<String> deleteJob(@PathVariable String jobId) {
        return ResponseEntity.ok(jobService.deleteJob(jobId));
    }
}

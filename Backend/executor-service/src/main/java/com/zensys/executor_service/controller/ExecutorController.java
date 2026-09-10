package com.zensys.executor_service.controller;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.zensys.executor_service.dto.JobExecutionRequest;
import com.zensys.executor_service.service.JobExecutionService;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Slf4j
@RestController
@RequestMapping("/executor")
@RequiredArgsConstructor
public class ExecutorController {

    private final JobExecutionService jobExecutionService;

    @PostMapping("/run")
    public ResponseEntity<Void> runJob(@RequestBody JobExecutionRequest request) {
        log.info("Received execution dispatch: runId={}, jobId={}", request.getRunId(), request.getJobId());

        // Asynchronously submit job to worker pool so dispatcher is never blocked
        jobExecutionService.submitJob(request);

        return ResponseEntity.accepted().build();
    }
}

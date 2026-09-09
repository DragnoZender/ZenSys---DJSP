package com.zensys.job_consumer_service.client;

import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;

import com.zensys.job_consumer_service.dto.JobExecutionRequest;

@FeignClient(name = "executor-service", url = "${executor.service.url:}")
public interface ExecutorClient {

    @PostMapping("/executor/run")
    ResponseEntity<Void> executeJob(@RequestBody JobExecutionRequest request);
}

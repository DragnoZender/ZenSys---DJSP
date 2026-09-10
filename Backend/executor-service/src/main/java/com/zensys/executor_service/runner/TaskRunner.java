package com.zensys.executor_service.runner;

import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.zensys.executor_service.dto.JobExecutionRequest;

import lombok.extern.slf4j.Slf4j;

@Slf4j
@Component
public class TaskRunner {

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final RestClient restClient = RestClient.builder().build();

    /**
     * Executes the task logic defined by the payload.
     * Throws an exception on task failure.
     */
    public void execute(JobExecutionRequest request) throws Exception {
        String payload = request.getPayload();
        log.info("Executing task for runId={}: payload={}", request.getRunId(), payload);

        if (payload == null || payload.isBlank()) {
            log.info("Empty payload for runId={}, completing no-op task", request.getRunId());
            return;
        }

        JsonNode root;
        try {
            root = objectMapper.readTree(payload);
        } catch (Exception e) {
            log.info("Payload is plain text for runId={}, simulated execution complete", request.getRunId());
            return;
        }

        // 1. HTTP Webhook Task
        if (root.has("url")) {
            executeHttpTask(request.getRunId(), root);
            return;
        }

        // 2. Simulated Task (for benchmarking / load testing)
        if (root.has("durationMs")) {
            executeSimulatedTask(request.getRunId(), root);
            return;
        }

        // 3. Default generic execution
        log.info("Completed generic task execution for runId={}", request.getRunId());
    }

    private void executeHttpTask(String runId, JsonNode node) {
        String url = node.get("url").asText();
        String method = node.has("method") ? node.get("method").asText().toUpperCase() : "POST";
        String body = node.has("body") ? node.get("body").toString() : null;

        log.info("Dispatching HTTP {} request to '{}' for runId={}", method, url, runId);

        RestClient.RequestBodySpec spec = restClient
                .method(HttpMethod.valueOf(method))
                .uri(url);

        if (body != null && !method.equals("GET")) {
            spec.body(body);
        }

        ResponseEntity<String> response = spec.retrieve().toEntity(String.class);

        if (!response.getStatusCode().is2xxSuccessful()) {
            throw new RuntimeException("HTTP task failed with status " + response.getStatusCode() + " and body "
                    + response.getBody());
        }

        log.info("HTTP task for runId={} completed with status {} and body {}", runId, response.getStatusCode(),
                response.getBody());
    }

    private void executeSimulatedTask(String runId, JsonNode node) throws Exception {
        long durationMs = node.get("durationMs").asLong(1000);
        boolean shouldFail = node.has("fail") && node.get("fail").asBoolean();

        log.info("Running simulated task for runId={}: durationMs={}, shouldFail={}", runId, durationMs, shouldFail);
        Thread.sleep(durationMs);

        if (shouldFail) {
            String error = node.has("errorMessage") ? node.get("errorMessage").asText() : "Simulated task error";
            throw new RuntimeException(error);
        }

        log.info("Simulated task completed successfully for runId={}", runId);
    }
}

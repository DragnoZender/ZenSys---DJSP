package com.zensys.retry_service.kafka;

import java.time.Duration;
import java.time.Instant;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.github.f4b6a3.ulid.UlidCreator;
import com.zensys.retry_service.dto.DelayedRetryItem;
import com.zensys.retry_service.dto.JobRetryEvent;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Slf4j
@Component
@RequiredArgsConstructor
public class RetryEventConsumer {

    private final StringRedisTemplate redisTemplate;
    private final ObjectMapper objectMapper;

    @Value("${retry.redis.zset-key:retry:delayed}")
    private String zsetKey;

    @Value("${retry.dedup.ttl-seconds:600}")
    private long dedupTtlSeconds;

    @KafkaListener(topics = "${job.retry-topic:retry}", groupId = "${spring.kafka.consumer.group-id:retry-service-group}")
    public void consume(JobRetryEvent event) {
        log.info("Received retry event: jobId={}, runId={}, nextAttempt={}, delaySeconds={}",
                event.getJobId(), event.getRunId(), event.getAttempt(), event.getRetryDelaySeconds());

        // 1. Compute delay and due timestamp
        long delaySeconds = event.getRetryDelaySeconds() != null ? event.getRetryDelaySeconds() : 10L;
        long dueTimestampMs = System.currentTimeMillis() + (delaySeconds * 1000L);

        // Dynamic TTL: ensures dedup key survives the entire delay duration + 300s buffer (min dedupTtlSeconds)
        long effectiveDedupTtl = Math.max(dedupTtlSeconds, delaySeconds + 300L);

        // 2. Deduplication guard via Redis SETNX with dynamic TTL
        String dedupKey = "retry:dedup:" + event.getJobId() + ":" + event.getAttempt();
        Boolean isNew = redisTemplate.opsForValue().setIfAbsent(dedupKey, "1", Duration.ofSeconds(effectiveDedupTtl));

        if (Boolean.FALSE.equals(isNew)) {
            log.warn("Duplicate retry event detected and ignored for jobId={}, attempt={}",
                    event.getJobId(), event.getAttempt());
            return;
        }

        // 3. Create unique DelayedRetryItem to store in Redis Sorted Set
        DelayedRetryItem item = DelayedRetryItem.builder()
                .retryId(UlidCreator.getUlid().toString())
                .originalRunId(event.getRunId())
                .jobId(event.getJobId())
                .payload(event.getPayload())
                .attempt(event.getAttempt())
                .maxRetries(event.getMaxRetries())
                .retryDelaySeconds(delaySeconds)
                .dueTimestampMs(dueTimestampMs)
                .createdAt(Instant.now())
                .build();

        try {
            String itemJson = objectMapper.writeValueAsString(item);
            redisTemplate.opsForZSet().add(zsetKey, itemJson, dueTimestampMs);
            log.info("Buffered retry item to Redis ZSET '{}': retryId={}, jobId={}, attempt={}, delay={}s, dueMs={}",
                    zsetKey, item.getRetryId(), item.getJobId(), item.getAttempt(), delaySeconds, dueTimestampMs);
        } catch (Exception e) {
            log.error("Failed to buffer retry item to Redis for jobId={}, runId={}: {}",
                    event.getJobId(), event.getRunId(), e.getMessage(), e);
            // Delete dedup key on buffer failure so it can be retried by consumer
            redisTemplate.delete(dedupKey);
            throw new RuntimeException("Redis buffering failed for retry item", e);
        }
    }
}

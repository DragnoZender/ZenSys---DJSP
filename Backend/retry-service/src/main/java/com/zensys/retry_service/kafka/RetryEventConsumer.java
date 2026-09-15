package com.zensys.retry_service.kafka;

import java.time.Instant;
import java.util.List;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.github.f4b6a3.ulid.UlidCreator;
import com.zensys.retry_service.dto.DelayedRetryItem;
import com.zensys.retry_service.dto.JobRetryEvent;

import jakarta.annotation.PostConstruct;
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

    private static final String ATOMIC_INGEST_LUA = """
            local dedup_key = KEYS[1]
            local zset_key = KEYS[2]
            local dedup_ttl = tonumber(ARGV[1])
            local due_timestamp = tonumber(ARGV[2])
            local item_json = ARGV[3]

            local set_result = redis.call('SET', dedup_key, '1', 'EX', dedup_ttl, 'NX')
            if not set_result then
                return 0
            end

            redis.call('ZADD', zset_key, due_timestamp, item_json)
            return 1
            """;

    private DefaultRedisScript<Long> ingestScript;

    @PostConstruct
    public void init() {
        ingestScript = new DefaultRedisScript<>();
        ingestScript.setScriptText(ATOMIC_INGEST_LUA);
        ingestScript.setResultType(Long.class);
    }

    @KafkaListener(topics = "${job.retry-topic:retry}", groupId = "${spring.kafka.consumer.group-id:retry-service-group}")
    public void consume(JobRetryEvent event) {
        log.info("Received retry event: jobId={}, runId={}, nextAttempt={}, delaySeconds={}",
                event.getJobId(), event.getRunId(), event.getAttempt(), event.getRetryDelaySeconds());

        // 1. Compute delay and due timestamp
        long delaySeconds = event.getRetryDelaySeconds() != null ? event.getRetryDelaySeconds() : 10L;
        long dueTimestampMs = System.currentTimeMillis() + (delaySeconds * 1000L);

        // Dynamic TTL: ensures dedup key survives the entire delay duration + 300s buffer (min dedupTtlSeconds)
        long effectiveDedupTtl = Math.max(dedupTtlSeconds, delaySeconds + 300L);
        String dedupKey = "retry:dedup:" + event.getJobId() + ":" + event.getAttempt();

        // 2. Create unique DelayedRetryItem to store in Redis Sorted Set
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

            // 3. Atomically check deduplication AND buffer to ZSET in a single Lua transaction
            Long result = redisTemplate.execute(
                    ingestScript,
                    List.of(dedupKey, zsetKey),
                    String.valueOf(effectiveDedupTtl),
                    String.valueOf(dueTimestampMs),
                    itemJson
            );

            if (Long.valueOf(0).equals(result)) {
                log.warn("Duplicate retry event detected and ignored for jobId={}, attempt={}",
                        event.getJobId(), event.getAttempt());
                return;
            }

            log.info("Atomically buffered retry item to Redis ZSET '{}': retryId={}, jobId={}, attempt={}, delay={}s, dueMs={}",
                    zsetKey, item.getRetryId(), item.getJobId(), item.getAttempt(), delaySeconds, dueTimestampMs);
        } catch (Exception e) {
            log.error("Failed to buffer retry item to Redis for jobId={}, runId={}: {}",
                    event.getJobId(), event.getRunId(), e.getMessage(), e);
            throw new RuntimeException("Redis atomic buffering failed for retry item", e);
        }
    }
}

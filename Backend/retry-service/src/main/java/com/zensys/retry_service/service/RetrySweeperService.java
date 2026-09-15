package com.zensys.retry_service.service;

import java.time.Instant;
import java.util.Collections;
import java.util.List;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.github.f4b6a3.ulid.UlidCreator;
import com.zensys.retry_service.dto.DelayedRetryItem;
import com.zensys.retry_service.dto.JobRunMessage;
import com.zensys.retry_service.kafka.RetryRunProducer;

import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Slf4j
@Service
@RequiredArgsConstructor
public class RetrySweeperService {

    private final StringRedisTemplate redisTemplate;
    private final RetryRunProducer runProducer;
    private final ObjectMapper objectMapper;

    @Value("${retry.redis.zset-key:retry:delayed}")
    private String zsetKey;

    @Value("${retry.sweeper.batch-size:100}")
    private int batchSize;

    @Value("${retry.sweeper.lease-duration-ms:30000}")
    private long leaseDurationMs;

    private static final String ATOMIC_LEASE_LUA = """
            local zset_key = KEYS[1]
            local now = tonumber(ARGV[1])
            local limit = tonumber(ARGV[2])
            local lease_ms = tonumber(ARGV[3])
            local items = redis.call('ZRANGEBYSCORE', zset_key, '-inf', now, 'LIMIT', 0, limit)
            if #items > 0 then
                for i, item in ipairs(items) do
                    -- Claim lease: push score into the future so other sweepers/nodes ignore it
                    redis.call('ZADD', zset_key, now + lease_ms, item)
                end
            end
            return items
            """;

    @SuppressWarnings("rawtypes")
    private DefaultRedisScript<List> leaseScript;

    @PostConstruct
    public void init() {
        leaseScript = new DefaultRedisScript<>();
        leaseScript.setScriptText(ATOMIC_LEASE_LUA);
        leaseScript.setResultType(List.class);
    }

    @Scheduled(fixedDelayString = "${retry.sweeper.interval-ms:1000}")
    public void sweepDueRetries() {
        long nowMs = System.currentTimeMillis();

        try {
            @SuppressWarnings("unchecked")
            List<String> dueItems = redisTemplate.execute(
                    leaseScript,
                    Collections.singletonList(zsetKey),
                    String.valueOf(nowMs),
                    String.valueOf(batchSize),
                    String.valueOf(leaseDurationMs));

            if (dueItems == null || dueItems.isEmpty()) {
                return;
            }

            log.info("Sweeper leased {} due retry items from '{}'", dueItems.size(), zsetKey);

            for (String itemJson : dueItems) {
                processDueItem(itemJson);
            }
        } catch (Exception e) {
            log.error("Error during retry sweeper execution: {}", e.getMessage(), e);
        }
    }

    private void processDueItem(String itemJson) {
        try {
            DelayedRetryItem item = objectMapper.readValue(itemJson, DelayedRetryItem.class);
            String newRunId = UlidCreator.getUlid().toString();

            JobRunMessage runMessage = JobRunMessage.builder()
                    .runId(newRunId)
                    .jobId(item.getJobId())
                    .payload(item.getPayload())
                    .attempt(item.getAttempt())
                    .maxRetries(item.getMaxRetries())
                    .scheduledAt(Instant.now())
                    .build();

            log.info("Re-dispatching due retry to 'run' topic: jobId={}, newRunId={}, attempt={}/{}",
                    item.getJobId(), newRunId, item.getAttempt(), item.getMaxRetries());

            // Await Kafka broker ACK before removing item from Redis (At-Least-Once
            // Delivery)
            boolean published = runProducer.publishToRunTopic(runMessage);
            if (published) {
                redisTemplate.opsForZSet().remove(zsetKey, itemJson);
                log.info("Acknowledged by Kafka, removed retry item from Redis: retryId={}, jobId={}",
                        item.getRetryId(), item.getJobId());
            } else {
                log.warn("Kafka publish unacknowledged for retryId={}. Retaining in Redis; lease will expire in {}ms",
                        item.getRetryId(), leaseDurationMs);
            }
        } catch (Exception e) {
            log.error("Failed to process due retry item JSON: '{}', error: {}", itemJson, e.getMessage(), e);
        }
    }
}

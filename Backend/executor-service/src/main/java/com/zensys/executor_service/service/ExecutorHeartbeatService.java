package com.zensys.executor_service.service;

import java.time.Duration;
import java.time.Instant;
import java.util.concurrent.atomic.AtomicInteger;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import lombok.Getter;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Slf4j
@Service
@RequiredArgsConstructor
public class ExecutorHeartbeatService {

    private final StringRedisTemplate redisTemplate;

    @Getter
    @Value("${executor.id:executor-8086}")
    private String executorId;

    @Value("${executor.heartbeat-ttl-seconds:30}")
    private long heartbeatTtlSeconds;

    @Scheduled(fixedRateString = "${executor.heartbeat-interval-ms:10000}")
    public void sendHeartbeat() {
        try {
            String heartbeatKey = "executor:" + executorId + ":heartbeat";

            System.out.println("\n\nSending heatbeat to Redis\n\n");

            // Single atomic command: sets liveness with auto-expiring TTL
            redisTemplate.opsForValue().set(
                    heartbeatKey,
                    Instant.now().toString(),
                    Duration.ofSeconds(heartbeatTtlSeconds));

            log.debug("Sent Redis heartbeat for executor '{}'", executorId);
        } catch (Exception e) {
            log.warn("Failed to send Redis heartbeat for executor '{}': {}", executorId, e.getMessage());
        }
    }
}

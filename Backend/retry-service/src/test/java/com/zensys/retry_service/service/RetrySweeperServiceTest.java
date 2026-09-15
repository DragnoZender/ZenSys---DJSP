package com.zensys.retry_service.service;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.lang.reflect.Field;
import java.time.Instant;
import java.util.Collections;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ZSetOperations;
import org.springframework.data.redis.core.script.DefaultRedisScript;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.zensys.retry_service.dto.DelayedRetryItem;
import com.zensys.retry_service.kafka.RetryRunProducer;

@ExtendWith(MockitoExtension.class)
class RetrySweeperServiceTest {

    @Mock
    private StringRedisTemplate redisTemplate;

    @Mock
    private ZSetOperations<String, String> zSetOperations;

    @Mock
    private RetryRunProducer runProducer;

    private ObjectMapper objectMapper;

    @InjectMocks
    private RetrySweeperService sweeperService;

    @BeforeEach
    void setUp() throws Exception {
        objectMapper = new ObjectMapper();
        objectMapper.registerModule(new JavaTimeModule());

        Field mapperField = RetrySweeperService.class.getDeclaredField("objectMapper");
        mapperField.setAccessible(true);
        mapperField.set(sweeperService, objectMapper);

        Field zsetKeyField = RetrySweeperService.class.getDeclaredField("zsetKey");
        zsetKeyField.setAccessible(true);
        zsetKeyField.set(sweeperService, "retry:delayed");

        Field batchSizeField = RetrySweeperService.class.getDeclaredField("batchSize");
        batchSizeField.setAccessible(true);
        batchSizeField.set(sweeperService, 100);

        Field leaseField = RetrySweeperService.class.getDeclaredField("leaseDurationMs");
        leaseField.setAccessible(true);
        leaseField.set(sweeperService, 30000L);

        sweeperService.init();
    }

    @Test
    void testSweepDueRetries_EmptyList_NoPublish() {
        when(redisTemplate.execute(any(DefaultRedisScript.class), eq(Collections.singletonList("retry:delayed")), any(), any(), any()))
                .thenReturn(Collections.emptyList());

        sweeperService.sweepDueRetries();

        verify(runProducer, never()).publishToRunTopic(any());
    }

    @Test
    void testSweepDueRetries_HasDueItems_PublishesAndRemovesOnSuccess() throws Exception {
        when(redisTemplate.opsForZSet()).thenReturn(zSetOperations);

        DelayedRetryItem item = DelayedRetryItem.builder()
                .retryId("01ARZ3NDEKTSV4RRFFQ69G5FAV")
                .originalRunId("01ARZ3NDEKTSV4RRFFQ69G5FAT")
                .jobId("job-456")
                .payload("{\"test\": true}")
                .attempt(2)
                .maxRetries(3)
                .retryDelaySeconds(20L)
                .dueTimestampMs(System.currentTimeMillis() - 1000)
                .createdAt(Instant.now())
                .build();

        String itemJson = objectMapper.writeValueAsString(item);

        when(redisTemplate.execute(any(DefaultRedisScript.class), eq(Collections.singletonList("retry:delayed")), any(), any(), any()))
                .thenReturn(List.of(itemJson));
        when(runProducer.publishToRunTopic(any())).thenReturn(true);

        sweeperService.sweepDueRetries();

        verify(runProducer).publishToRunTopic(argThat(msg ->
                msg.getJobId().equals("job-456") &&
                msg.getAttempt().equals(2) &&
                msg.getRunId() != null &&
                !msg.getRunId().equals("01ARZ3NDEKTSV4RRFFQ69G5FAT")
        ));

        // Verifies item is removed from Redis only after Kafka confirmation
        verify(zSetOperations).remove("retry:delayed", itemJson);
    }

    @Test
    void testSweepDueRetries_PublishFails_DoesNotRemoveFromRedis() throws Exception {
        DelayedRetryItem item = DelayedRetryItem.builder()
                .retryId("01ARZ3NDEKTSV4RRFFQ69G5FAV")
                .originalRunId("01ARZ3NDEKTSV4RRFFQ69G5FAT")
                .jobId("job-456")
                .payload("{\"test\": true}")
                .attempt(2)
                .maxRetries(3)
                .retryDelaySeconds(20L)
                .dueTimestampMs(System.currentTimeMillis() - 1000)
                .createdAt(Instant.now())
                .build();

        String itemJson = objectMapper.writeValueAsString(item);

        when(redisTemplate.execute(any(DefaultRedisScript.class), eq(Collections.singletonList("retry:delayed")), any(), any(), any()))
                .thenReturn(List.of(itemJson));
        when(runProducer.publishToRunTopic(any())).thenReturn(false);

        sweeperService.sweepDueRetries();

        verify(runProducer).publishToRunTopic(any());
        // Must NOT remove from Redis so lease can expire and retry
        verify(redisTemplate, never()).opsForZSet();
    }
}

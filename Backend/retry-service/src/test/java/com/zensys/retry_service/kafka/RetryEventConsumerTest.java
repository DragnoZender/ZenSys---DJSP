package com.zensys.retry_service.kafka;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyDouble;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.lang.reflect.Field;
import java.time.Duration;
import java.time.Instant;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;
import org.springframework.data.redis.core.ZSetOperations;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.zensys.retry_service.dto.JobRetryEvent;

@ExtendWith(MockitoExtension.class)
class RetryEventConsumerTest {

    @Mock
    private StringRedisTemplate redisTemplate;

    @Mock
    private ValueOperations<String, String> valueOperations;

    @Mock
    private ZSetOperations<String, String> zSetOperations;

    private ObjectMapper objectMapper;

    @InjectMocks
    private RetryEventConsumer retryEventConsumer;

    @BeforeEach
    void setUp() throws Exception {
        objectMapper = new ObjectMapper();
        objectMapper.registerModule(new JavaTimeModule());

        Field mapperField = RetryEventConsumer.class.getDeclaredField("objectMapper");
        mapperField.setAccessible(true);
        mapperField.set(retryEventConsumer, objectMapper);

        Field zsetKeyField = RetryEventConsumer.class.getDeclaredField("zsetKey");
        zsetKeyField.setAccessible(true);
        zsetKeyField.set(retryEventConsumer, "retry:delayed");

        Field ttlField = RetryEventConsumer.class.getDeclaredField("dedupTtlSeconds");
        ttlField.setAccessible(true);
        ttlField.set(retryEventConsumer, 600L);
    }

    @Test
    void testConsume_NewEvent_SuccessfullyBuffered() {
        when(redisTemplate.opsForValue()).thenReturn(valueOperations);
        when(redisTemplate.opsForZSet()).thenReturn(zSetOperations);
        when(valueOperations.setIfAbsent(eq("retry:dedup:job-123:2"), eq("1"), any(Duration.class)))
                .thenReturn(Boolean.TRUE);

        JobRetryEvent event = JobRetryEvent.builder()
                .runId("01ARZ3NDEKTSV4RRFFQ69G5FAV")
                .jobId("job-123")
                .payload("{\"timeoutSeconds\": 30}")
                .attempt(2)
                .maxRetries(3)
                .retryDelaySeconds(20L)
                .errorMsg("Timeout")
                .timestamp(Instant.now())
                .build();

        retryEventConsumer.consume(event);

        verify(zSetOperations).add(eq("retry:delayed"), anyString(), anyDouble());
    }

    @Test
    void testConsume_DuplicateEvent_Dropped() {
        when(redisTemplate.opsForValue()).thenReturn(valueOperations);
        when(valueOperations.setIfAbsent(eq("retry:dedup:job-123:2"), eq("1"), any(Duration.class)))
                .thenReturn(Boolean.FALSE);

        JobRetryEvent event = JobRetryEvent.builder()
                .runId("01ARZ3NDEKTSV4RRFFQ69G5FAV")
                .jobId("job-123")
                .payload("{\"timeoutSeconds\": 30}")
                .attempt(2)
                .maxRetries(3)
                .retryDelaySeconds(20L)
                .errorMsg("Timeout")
                .timestamp(Instant.now())
                .build();

        retryEventConsumer.consume(event);

        verify(redisTemplate, never()).opsForZSet();
    }
}

package com.zensys.retry_service.kafka;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.lang.reflect.Field;
import java.time.Instant;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.zensys.retry_service.dto.JobRetryEvent;

@ExtendWith(MockitoExtension.class)
class RetryEventConsumerTest {

    @Mock
    private StringRedisTemplate redisTemplate;

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

        retryEventConsumer.init();
    }

    @Test
    void testConsume_NewEvent_AtomicallyBuffered() {
        when(redisTemplate.execute(
                any(DefaultRedisScript.class),
                eq(List.of("retry:dedup:job-123:2", "retry:delayed")),
                any(), any(), any()
        )).thenReturn(1L);

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

        verify(redisTemplate).execute(
                any(DefaultRedisScript.class),
                eq(List.of("retry:dedup:job-123:2", "retry:delayed")),
                any(), any(), any()
        );
    }

    @Test
    void testConsume_DuplicateEvent_Dropped() {
        when(redisTemplate.execute(
                any(DefaultRedisScript.class),
                eq(List.of("retry:dedup:job-123:2", "retry:delayed")),
                any(), any(), any()
        )).thenReturn(0L);

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

        verify(redisTemplate).execute(
                any(DefaultRedisScript.class),
                eq(List.of("retry:dedup:job-123:2", "retry:delayed")),
                any(), any(), any()
        );
    }
}

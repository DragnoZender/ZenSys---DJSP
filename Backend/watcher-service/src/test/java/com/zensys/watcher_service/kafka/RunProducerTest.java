package com.zensys.watcher_service.kafka;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.support.SendResult;
import org.springframework.test.util.ReflectionTestUtils;

import com.zensys.watcher_service.event.JobRunEvent;

@ExtendWith(MockitoExtension.class)
class RunProducerTest {

    @Mock
    private KafkaTemplate<String, JobRunEvent> kafkaTemplate;

    @InjectMocks
    private RunProducer runProducer;

    @BeforeEach
    void setUp() {
        ReflectionTestUtils.setField(runProducer, "runTopic", "test-run");
        ReflectionTestUtils.setField(runProducer, "sendTimeoutSeconds", 2L);
    }

    @Test
    @DisplayName("Should send event and await ACK successfully")
    void testSendRunEvent_Success() {
        JobRunEvent event = JobRunEvent.builder()
                .runId("run-123")
                .jobId("job-456")
                .build();

        @SuppressWarnings("unchecked")
        SendResult<String, JobRunEvent> sendResult = mock(SendResult.class);
        CompletableFuture<SendResult<String, JobRunEvent>> future = CompletableFuture.completedFuture(sendResult);

        when(kafkaTemplate.send(eq("test-run"), eq("job-456"), eq(event))).thenReturn(future);

        runProducer.sendRunEvent(event);

        verify(kafkaTemplate).send("test-run", "job-456", event);
    }

    @Test
    @DisplayName("Should throw RuntimeException when Kafka send times out")
    void testSendRunEvent_Timeout() {
        JobRunEvent event = JobRunEvent.builder()
                .runId("run-123")
                .jobId("job-456")
                .build();

        CompletableFuture<SendResult<String, JobRunEvent>> future = new CompletableFuture<>();
        // Future never completes, simulating broker stall
        when(kafkaTemplate.send(eq("test-run"), eq("job-456"), eq(event))).thenReturn(future);

        // Use a short timeout for the test
        ReflectionTestUtils.setField(runProducer, "sendTimeoutSeconds", 1L);

        assertThatThrownBy(() -> runProducer.sendRunEvent(event))
                .isInstanceOf(RuntimeException.class)
                .hasMessageContaining("Failed to publish job run event to Kafka topic 'test-run'");
    }

    @Test
    @DisplayName("Should throw RuntimeException when Kafka send completes exceptionally")
    void testSendRunEvent_BrokerError() {
        JobRunEvent event = JobRunEvent.builder()
                .runId("run-123")
                .jobId("job-456")
                .build();

        CompletableFuture<SendResult<String, JobRunEvent>> future = new CompletableFuture<>();
        future.completeExceptionally(new RuntimeException("Connection refused"));

        when(kafkaTemplate.send(eq("test-run"), eq("job-456"), eq(event))).thenReturn(future);

        assertThatThrownBy(() -> runProducer.sendRunEvent(event))
                .isInstanceOf(RuntimeException.class)
                .hasMessageContaining("Connection refused");
    }
}

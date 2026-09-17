package com.zensys.watcher_service.kafka;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.concurrent.CompletableFuture;

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

import com.zensys.watcher_service.event.JobDeadEvent;
import com.zensys.watcher_service.event.JobRetryEvent;
import com.zensys.watcher_service.event.JobRunLifecycleEvent;

@ExtendWith(MockitoExtension.class)
class ExecutorRecoveryProducerTest {

    @SuppressWarnings("rawtypes")
    @Mock
    private KafkaTemplate kafkaTemplate;

    @InjectMocks
    private ExecutorRecoveryProducer recoveryProducer;

    @BeforeEach
    void setUp() {
        ReflectionTestUtils.setField(recoveryProducer, "retryTopic", "test-retry");
        ReflectionTestUtils.setField(recoveryProducer, "jobRunEventsTopic", "test-lifecycle");
        ReflectionTestUtils.setField(recoveryProducer, "deadTopic", "test-dead");
        ReflectionTestUtils.setField(recoveryProducer, "sendTimeoutSeconds", 2L);
    }

    @SuppressWarnings("unchecked")
    @Test
    @DisplayName("Should send retry event and await ACK")
    void testSendRetryEvent() {
        JobRetryEvent event = JobRetryEvent.builder().jobId("job-1").runId("run-1").attempt(2).build();
        SendResult sendResult = mock(SendResult.class);
        when(kafkaTemplate.send(eq("test-retry"), eq("job-1"), eq(event)))
                .thenReturn(CompletableFuture.completedFuture(sendResult));

        recoveryProducer.sendRetryEvent(event);

        verify(kafkaTemplate).send("test-retry", "job-1", event);
    }

    @SuppressWarnings("unchecked")
    @Test
    @DisplayName("Should send dead event and await ACK")
    void testSendDeadEvent() {
        JobDeadEvent event = JobDeadEvent.builder().jobId("job-1").runId("run-1").attempt(3).build();
        SendResult sendResult = mock(SendResult.class);
        when(kafkaTemplate.send(eq("test-dead"), eq("job-1"), eq(event)))
                .thenReturn(CompletableFuture.completedFuture(sendResult));

        recoveryProducer.sendDeadEvent(event);

        verify(kafkaTemplate).send("test-dead", "job-1", event);
    }

    @SuppressWarnings("unchecked")
    @Test
    @DisplayName("Should send lifecycle event and await ACK")
    void testSendLifecycleEvent() {
        JobRunLifecycleEvent event = JobRunLifecycleEvent.builder().runId("run-1").build();
        SendResult sendResult = mock(SendResult.class);
        when(kafkaTemplate.send(eq("test-lifecycle"), eq("run-1"), eq(event)))
                .thenReturn(CompletableFuture.completedFuture(sendResult));

        recoveryProducer.sendLifecycleEvent(event);

        verify(kafkaTemplate).send("test-lifecycle", "run-1", event);
    }

    @SuppressWarnings("unchecked")
    @Test
    @DisplayName("Should wrap timeout/broker errors in RuntimeException")
    void testSendRetryEvent_Error() {
        JobRetryEvent event = JobRetryEvent.builder().jobId("job-1").build();
        CompletableFuture future = new CompletableFuture();
        future.completeExceptionally(new RuntimeException("Kafka unreachable"));
        when(kafkaTemplate.send(eq("test-retry"), eq("job-1"), eq(event))).thenReturn(future);

        assertThatThrownBy(() -> recoveryProducer.sendRetryEvent(event))
                .isInstanceOf(RuntimeException.class)
                .hasMessageContaining("Failed to send retry event for jobId=job-1");
    }
}

package com.zensys.consumer_service.config;

import java.util.HashMap;
import java.util.Map;

import org.apache.kafka.clients.consumer.ConsumerConfig;
import org.apache.kafka.common.serialization.StringDeserializer;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.kafka.config.ConcurrentKafkaListenerContainerFactory;
import org.springframework.kafka.core.DefaultKafkaConsumerFactory;
import org.springframework.kafka.support.serializer.JacksonJsonDeserializer;

import com.zensys.consumer_service.event.JobCommand;
import com.zensys.consumer_service.event.JobDeadEvent;
import com.zensys.consumer_service.event.JobRunLifecycleEvent;

@Configuration
public class KafkaConsumerConfig {

    @Value("${spring.kafka.bootstrap-servers:localhost:9092}")
    private String bootstrapServers;

    @Bean
    public ConcurrentKafkaListenerContainerFactory<String, JobCommand> jobCommandListenerContainerFactory() {
        return createContainerFactory(JobCommand.class, "job-consumer-group");
    }

    @Bean
    public ConcurrentKafkaListenerContainerFactory<String, JobRunLifecycleEvent> jobRunEventListenerContainerFactory() {
        return createContainerFactory(JobRunLifecycleEvent.class, "job-run-events-consumer-group");
    }

    @Bean
    public ConcurrentKafkaListenerContainerFactory<String, JobDeadEvent> jobDeadEventListenerContainerFactory() {
        return createContainerFactory(JobDeadEvent.class, "job-dead-consumer-group");
    }

    private <T> ConcurrentKafkaListenerContainerFactory<String, T> createContainerFactory(Class<T> targetType, String groupId) {
        Map<String, Object> props = new HashMap<>();
        props.put(ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG, bootstrapServers);
        props.put(ConsumerConfig.GROUP_ID_CONFIG, groupId);
        props.put(ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, "earliest");

        JacksonJsonDeserializer<T> deserializer = new JacksonJsonDeserializer<>(targetType);
        deserializer.addTrustedPackages("*");
        deserializer.ignoreTypeHeaders();

        DefaultKafkaConsumerFactory<String, T> consumerFactory =
                new DefaultKafkaConsumerFactory<>(props, new StringDeserializer(), deserializer);

        ConcurrentKafkaListenerContainerFactory<String, T> factory = new ConcurrentKafkaListenerContainerFactory<>();
        factory.setConsumerFactory(consumerFactory);
        return factory;
    }
}

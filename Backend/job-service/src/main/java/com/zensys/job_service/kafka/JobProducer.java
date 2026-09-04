package com.zensys.job_service.kafka;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;

import com.zensys.job_service.event.JobCommand;




@Component
public class JobProducer {

    @Autowired
    private KafkaTemplate<String, JobCommand> kafkaTemplate;

    private static final String JOB_COMMANDS_TOPIC = "job-commands";

    public void sendJobCommand(JobCommand command) {

        kafkaTemplate.send(
                JOB_COMMANDS_TOPIC,
                command.getJobId().toString(), //Key so that same job operations goes to same partition for consistency of operations
                command
        );
    }
}
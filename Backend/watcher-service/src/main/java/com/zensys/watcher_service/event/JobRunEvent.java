package com.zensys.watcher_service.event;

import java.time.Instant;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class JobRunEvent {

    private String runId;
    private String jobId;
    private String payload;
    private Integer attempt;
    private Instant scheduledAt;
    private Integer maxRetries;
}

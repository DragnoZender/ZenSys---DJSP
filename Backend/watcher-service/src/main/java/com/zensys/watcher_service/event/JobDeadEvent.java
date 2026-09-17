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
public class JobDeadEvent {

    private String runId;
    private String jobId;
    private String payload;
    private Integer attempt;
    private Integer maxRetries;
    private String errorMsg;
    private Instant timestamp;
}

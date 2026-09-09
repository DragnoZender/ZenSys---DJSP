package com.zensys.watcher_service.scheduler;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import com.zensys.watcher_service.service.JobWatcherService;

//
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Slf4j
@Component
@RequiredArgsConstructor
public class WatcherScheduler {

    private final JobWatcherService jobWatcherService;

    static int i =0;

    @Scheduled(fixedDelayString = "${watcher.polling.interval-ms:20000}")
    public void scheduleJobPolling() {
        log.debug("Watcher polling cycle triggered");
        System.out.println("\n\n Iteration count = " + (i++) + "\n\n");
        try {
            jobWatcherService.pollAndDispatchDueJobs();
        } catch (Exception e) {
            log.error("Unexpected error in watcher polling cycle: {}", e.getMessage(), e);
        }
    }
}

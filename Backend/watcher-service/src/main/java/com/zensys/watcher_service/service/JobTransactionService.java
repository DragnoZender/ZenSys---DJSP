package com.zensys.watcher_service.service;

import java.time.Instant;
import java.util.List;
import java.util.function.Consumer;

import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.zensys.watcher_service.model.Job;
import com.zensys.watcher_service.repository.JobRepository;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Slf4j
@Service
@RequiredArgsConstructor
public class JobTransactionService {

    private final JobRepository jobRepository;

    @Transactional
    public List<Job> claimDueJobs(Instant now, Instant threshold, int batchSize) {
        List<Job> dueJobs = jobRepository.findDueJobs(now, threshold, PageRequest.of(0, batchSize));
        if (dueJobs.isEmpty()) {
            return List.of();
        }
        for (Job job : dueJobs) {
            job.setLastPolledTime(now);
        }
        return jobRepository.saveAll(dueJobs);
    }

    @Transactional
    public Job advanceAndSaveJob(String jobId, Consumer<Job> scheduleAdvancer) {
        Job job = jobRepository.findById(jobId).orElse(null);
        if (job != null) {
            scheduleAdvancer.accept(job);
            return jobRepository.save(job);
        }
        return null;
    }

    @Transactional
    public void releaseJobLease(String jobId) {
        try {
            jobRepository.updateLastPolledTime(jobId, null);
        } catch (Exception e) {
            log.warn("Failed to release lease for job id={}: {}", jobId, e.getMessage());
        }
    }
}

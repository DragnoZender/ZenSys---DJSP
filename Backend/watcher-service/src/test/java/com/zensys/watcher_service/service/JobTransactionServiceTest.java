package com.zensys.watcher_service.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Pageable;

import com.zensys.watcher_service.model.Job;
import com.zensys.watcher_service.model.JobStatus;
import com.zensys.watcher_service.repository.JobRepository;

@ExtendWith(MockitoExtension.class)
class JobTransactionServiceTest {

    @Mock
    private JobRepository jobRepository;

    @InjectMocks
    private JobTransactionService jobTransactionService;

    @Test
    @DisplayName("Should return empty list when no due jobs found")
    void testClaimDueJobs_Empty() {
        Instant now = Instant.now();
        Instant threshold = now.minusSeconds(30);

        when(jobRepository.findDueJobs(eq(now), eq(threshold), any(Pageable.class)))
                .thenReturn(List.of());

        List<Job> claimed = jobTransactionService.claimDueJobs(now, threshold, 100);

        assertThat(claimed).isEmpty();
        verify(jobRepository, never()).saveAll(any());
    }

    @Test
    @DisplayName("Should claim due jobs and update lastPolledTime on all")
    void testClaimDueJobs_Success() {
        Instant now = Instant.now();
        Instant threshold = now.minusSeconds(30);

        Job job1 = Job.builder().id("job-1").name("Job 1").build();
        Job job2 = Job.builder().id("job-2").name("Job 2").build();

        when(jobRepository.findDueJobs(eq(now), eq(threshold), any(Pageable.class)))
                .thenReturn(List.of(job1, job2));
        when(jobRepository.saveAll(any())).thenAnswer(inv -> inv.getArgument(0));

        List<Job> claimed = jobTransactionService.claimDueJobs(now, threshold, 100);

        assertThat(claimed).hasSize(2);
        assertThat(job1.getLastPolledTime()).isEqualTo(now);
        assertThat(job2.getLastPolledTime()).isEqualTo(now);
        verify(jobRepository, times(1)).saveAll(claimed);
    }

    @Test
    @DisplayName("Should advance and save job when job exists")
    void testAdvanceAndSaveJob_Found() {
        Job job = Job.builder().id("job-1").status(JobStatus.SCHEDULED).build();

        when(jobRepository.findById("job-1")).thenReturn(Optional.of(job));
        when(jobRepository.save(any(Job.class))).thenAnswer(inv -> inv.getArgument(0));

        Job result = jobTransactionService.advanceAndSaveJob("job-1", j -> j.setStatus(JobStatus.RUNNING));

        assertThat(result).isNotNull();
        assertThat(result.getStatus()).isEqualTo(JobStatus.RUNNING);
        verify(jobRepository, times(1)).save(job);
    }

    @Test
    @DisplayName("Should return null when advancing non-existent job")
    void testAdvanceAndSaveJob_NotFound() {
        when(jobRepository.findById("non-existent")).thenReturn(Optional.empty());

        Job result = jobTransactionService.advanceAndSaveJob("non-existent", j -> j.setStatus(JobStatus.RUNNING));

        assertThat(result).isNull();
        verify(jobRepository, never()).save(any());
    }

    @Test
    @DisplayName("Should release job lease by setting lastPolledTime to null")
    void testReleaseJobLease() {
        jobTransactionService.releaseJobLease("job-1");

        verify(jobRepository, times(1)).updateLastPolledTime(eq("job-1"), isNull());
    }
}

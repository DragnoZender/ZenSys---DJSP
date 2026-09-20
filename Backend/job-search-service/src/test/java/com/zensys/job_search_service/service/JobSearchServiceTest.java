package com.zensys.job_search_service.service;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import static org.mockito.ArgumentMatchers.any;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import org.mockito.junit.jupiter.MockitoExtension;

import com.zensys.job_search_service.dto.JobResponse;
import com.zensys.job_search_service.dto.JobRunResponse;
import com.zensys.job_search_service.model.Job;
import com.zensys.job_search_service.model.JobRun;
import com.zensys.job_search_service.model.JobRunStatus;
import com.zensys.job_search_service.model.JobStatus;
import com.zensys.job_search_service.model.ScheduleType;
import com.zensys.job_search_service.repository.JobRepository;
import com.zensys.job_search_service.repository.JobRunRepository;

@ExtendWith(MockitoExtension.class)
class JobSearchServiceTest {

    @Mock
    private JobRepository jobRepository;

    @Mock
    private JobRunRepository jobRunRepository;

    @InjectMocks
    private JobSearchService jobSearchService;

    private Job sampleJob;
    private JobRun sampleRun;

    @BeforeEach
    void setUp() {
        sampleJob = Job.builder()
                .id("01HXYZ1234567890ABCDEF1234")
                .name("Test Job")
                .scheduleType(ScheduleType.CRON)
                .status(JobStatus.SCHEDULED)
                .cronExpression("0 0 * * *")
                .retries(3)
                .payload("{\"key\":\"value\"}")
                .meta("{\"env\":\"prod\"}")
                .build();

        sampleRun = JobRun.builder()
                .id(1L)
                .runId("01HXYZRUN00000000000000001")
                .job(sampleJob)
                .status(JobRunStatus.SUCCESS)
                .startTime(Instant.now().minusSeconds(10))
                .endTime(Instant.now())
                .modificationTime(Instant.now())
                .executorId("exec-1")
                .attemptNumber(1)
                .executionTimeMs(1200L)
                .build();
    }

    @Test
    void testGetJobById_Success() {
        when(jobRepository.findById("01HXYZ1234567890ABCDEF1234")).thenReturn(Optional.of(sampleJob));

        JobResponse response = jobSearchService.getJobById("01HXYZ1234567890ABCDEF1234");

        assertNotNull(response);
        assertEquals("01HXYZ1234567890ABCDEF1234", response.getJobId());
        assertEquals("Test Job", response.getName());
    }

    @Test
    void testGetJobById_NotFound() {
        when(jobRepository.findById("non-existent")).thenReturn(Optional.empty());

        assertThrows(RuntimeException.class, () -> jobSearchService.getJobById("non-existent"));
    }

    @Test
    void testGetJobs_WithFilters() {
        when(jobRepository.findByStatusAndScheduleType(JobStatus.SCHEDULED, ScheduleType.CRON))
                .thenReturn(List.of(sampleJob));

        List<JobResponse> responses = jobSearchService.getJobs(JobStatus.SCHEDULED, ScheduleType.CRON);

        assertEquals(1, responses.size());
        assertEquals("Test Job", responses.get(0).getName());
    }

    @Test
    void testGetRunsForJob_Success() {
        when(jobRepository.existsById("01HXYZ1234567890ABCDEF1234")).thenReturn(true);
        when(jobRunRepository.findByJob_IdOrderByStartTimeDesc("01HXYZ1234567890ABCDEF1234"))
                .thenReturn(List.of(sampleRun));

        List<JobRunResponse> runs = jobSearchService.getRunsForJob("01HXYZ1234567890ABCDEF1234");

        assertEquals(1, runs.size());
        assertEquals("01HXYZRUN00000000000000001", runs.get(0).getRunId());
        assertEquals(JobRunStatus.SUCCESS, runs.get(0).getStatus());
        assertEquals("01HXYZ1234567890ABCDEF1234", runs.get(0).getJobId());
    }

    @Test
    void testGetRunsForJob_JobNotFound() {
        when(jobRepository.existsById("non-existent")).thenReturn(false);

        assertThrows(RuntimeException.class, () -> jobSearchService.getRunsForJob("non-existent"));
        verify(jobRunRepository, never()).findByJob_IdOrderByStartTimeDesc(any());
    }

    @Test
    void testGetRunByRunId_Success() {
        when(jobRunRepository.findByRunId("01HXYZRUN00000000000000001")).thenReturn(Optional.of(sampleRun));

        JobRunResponse response = jobSearchService.getRunByRunId("01HXYZRUN00000000000000001");

        assertNotNull(response);
        assertEquals("01HXYZRUN00000000000000001", response.getRunId());
        assertEquals(1200L, response.getExecutionTimeMs());
        assertEquals("exec-1", response.getExecutorId());
    }

    @Test
    void testGetAllRuns_FilteredByStatus() {
        when(jobRunRepository.findByStatus(JobRunStatus.SUCCESS)).thenReturn(List.of(sampleRun));

        List<JobRunResponse> runs = jobSearchService.getAllRuns(JobRunStatus.SUCCESS);

        assertEquals(1, runs.size());
        assertEquals(JobRunStatus.SUCCESS, runs.get(0).getStatus());
    }
}

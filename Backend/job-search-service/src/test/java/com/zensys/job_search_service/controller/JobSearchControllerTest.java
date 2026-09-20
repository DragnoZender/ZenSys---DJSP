package com.zensys.job_search_service.controller;

import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import static org.mockito.Mockito.when;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.web.servlet.MockMvc;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import com.zensys.job_search_service.dto.JobResponse;
import com.zensys.job_search_service.dto.JobRunResponse;
import com.zensys.job_search_service.model.JobRunStatus;
import com.zensys.job_search_service.model.JobStatus;
import com.zensys.job_search_service.service.JobSearchService;

@ExtendWith(MockitoExtension.class)
class JobSearchControllerTest {

    private MockMvc mockMvc;

    @Mock
    private JobSearchService jobSearchService;

    @InjectMocks
    private JobSearchController jobSearchController;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.standaloneSetup(jobSearchController).build();
    }

    @Test
    void testGetJobById() throws Exception {
        JobResponse job = JobResponse.builder()
                .jobId("job-123")
                .name("Daily Backup")
                .status(JobStatus.SCHEDULED)
                .build();

        when(jobSearchService.getJobById("job-123")).thenReturn(job);

        mockMvc.perform(get("/jobs/job-123"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.jobId").value("job-123"))
                .andExpect(jsonPath("$.name").value("Daily Backup"));
    }

    @Test
    void testGetRunsForJob() throws Exception {
        JobRunResponse run = JobRunResponse.builder()
                .runId("run-999")
                .jobId("job-123")
                .status(JobRunStatus.SUCCESS)
                .executionTimeMs(1500L)
                .build();

        when(jobSearchService.getRunsForJob("job-123")).thenReturn(List.of(run));

        mockMvc.perform(get("/jobs/job-123/runs"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].runId").value("run-999"))
                .andExpect(jsonPath("$[0].status").value("SUCCESS"));
    }

    @Test
    void testGetRunByRunId() throws Exception {
        JobRunResponse run = JobRunResponse.builder()
                .runId("run-999")
                .jobId("job-123")
                .status(JobRunStatus.FAILED)
                .errorMsg("Connection timed out")
                .build();

        when(jobSearchService.getRunByRunId("run-999")).thenReturn(run);

        mockMvc.perform(get("/jobs/runs/run-999"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.runId").value("run-999"))
                .andExpect(jsonPath("$.errorMsg").value("Connection timed out"));
    }

    @Test
    void testGetAllRunsWithStatusFilter() throws Exception {
        JobRunResponse run = JobRunResponse.builder()
                .runId("run-fail-1")
                .status(JobRunStatus.FAILED)
                .build();

        when(jobSearchService.getAllRuns(JobRunStatus.FAILED)).thenReturn(List.of(run));

        mockMvc.perform(get("/jobs/runs?status=FAILED"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].runId").value("run-fail-1"))
                .andExpect(jsonPath("$[0].status").value("FAILED"));
    }
}

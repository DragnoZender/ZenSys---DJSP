package com.zensys.job_search_service.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.zensys.job_search_service.model.JobRun;
import com.zensys.job_search_service.model.JobRunStatus;

@Repository
public interface JobRunRepository extends JpaRepository<JobRun, Long> {

    Optional<JobRun> findByRunId(String runId);

    List<JobRun> findByJob_IdOrderByStartTimeDesc(String jobId);

    List<JobRun> findByJob_Id(String jobId);

    List<JobRun> findByStatus(JobRunStatus status);

    List<JobRun> findByJob_IdAndStatus(String jobId, JobRunStatus status);
}

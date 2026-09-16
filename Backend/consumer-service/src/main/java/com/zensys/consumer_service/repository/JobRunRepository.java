package com.zensys.consumer_service.repository;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.zensys.consumer_service.model.JobRun;

@Repository
public interface JobRunRepository extends JpaRepository<JobRun, Long> {

    Optional<JobRun> findByRunId(String runId);
}

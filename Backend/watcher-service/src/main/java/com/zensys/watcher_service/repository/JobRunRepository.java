package com.zensys.watcher_service.repository;

import java.time.Instant;
import java.util.List;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.zensys.watcher_service.model.JobRun;

@Repository
public interface JobRunRepository extends JpaRepository<JobRun, Long> {

    @Query("""
        SELECT r FROM JobRun r
        JOIN FETCH r.job
        WHERE r.status = 'RUNNING'
          AND r.executorId IS NOT NULL
          AND r.modificationTime < :threshold
        ORDER BY r.modificationTime ASC
    """)
    List<JobRun> findStaleRunningRuns(@Param("threshold") Instant threshold, Pageable pageable);
}

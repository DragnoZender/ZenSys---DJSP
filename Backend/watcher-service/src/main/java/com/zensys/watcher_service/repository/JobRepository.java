package com.zensys.watcher_service.repository;

import java.time.Instant;
import java.util.List;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.jpa.repository.QueryHints;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.zensys.watcher_service.model.Job;

import jakarta.persistence.LockModeType;
import jakarta.persistence.QueryHint;

@Repository
public interface JobRepository extends JpaRepository<Job, String> {

  @Lock(LockModeType.PESSIMISTIC_WRITE)
  @QueryHints({@QueryHint(name = "jakarta.persistence.lock.timeout", value = "-2")})
  @Query("""
          SELECT j FROM Job j
          WHERE j.status IN ('SCHEDULED', 'RUNNING')
            AND j.nextRunTime <= :now
            AND (j.lastPolledTime IS NULL OR j.lastPolledTime < :threshold)
          ORDER BY j.nextRunTime ASC
      """)
  List<Job> findDueJobs(
      @Param("now") Instant now,
      @Param("threshold") Instant threshold,
      Pageable pageable);

  @Modifying
  @Query("UPDATE Job j SET j.lastPolledTime = :polledTime WHERE j.id = :jobId")
  int updateLastPolledTime(@Param("jobId") String jobId, @Param("polledTime") Instant polledTime);
}

package com.zensys.job_search_service.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.zensys.job_search_service.model.Job;
import com.zensys.job_search_service.model.JobStatus;
import com.zensys.job_search_service.model.ScheduleType;

@Repository
public interface JobRepository extends JpaRepository<Job, String> {

    List<Job> findByStatus(JobStatus status);

    List<Job> findByScheduleType(ScheduleType scheduleType);

    List<Job> findByStatusAndScheduleType(JobStatus status, ScheduleType scheduleType);
}


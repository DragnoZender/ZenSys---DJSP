package com.zensys.job_search_service.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.zensys.job_search_service.model.Job;

@Repository
public interface JobRepository extends JpaRepository<Job, String> {
}

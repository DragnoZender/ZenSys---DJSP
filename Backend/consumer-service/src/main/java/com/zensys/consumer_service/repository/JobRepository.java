package com.zensys.consumer_service.repository;

import org.springframework.data.jpa.repository.JpaRepository;

import com.zensys.consumer_service.model.Job;

public interface JobRepository extends JpaRepository<Job, Long> {

}
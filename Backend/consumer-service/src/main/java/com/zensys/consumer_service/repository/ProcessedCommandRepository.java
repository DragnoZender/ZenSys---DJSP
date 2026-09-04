package com.zensys.consumer_service.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.zensys.consumer_service.model.ProcessedCommand;


@Repository 
public interface ProcessedCommandRepository extends JpaRepository<ProcessedCommand, String>{

}

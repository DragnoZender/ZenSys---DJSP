package com.zensys.watcher_service;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling // Tells Spring to start an internal task scheduler thread pool
public class WatcherServiceApplication {

	public static void main(String[] args) {
		SpringApplication.run(WatcherServiceApplication.class, args);
	}

}

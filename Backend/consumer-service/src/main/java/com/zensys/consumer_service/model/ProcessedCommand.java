package com.zensys.consumer_service.model;

import java.time.LocalDateTime;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "processed_commands")

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ProcessedCommand {

    @Id
    @Column(length = 26)
    private String eventId;

    private LocalDateTime processedAt;
}
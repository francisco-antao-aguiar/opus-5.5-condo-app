package com.condo.issue;

import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface IssueEventRepository extends JpaRepository<IssueEvent, UUID> {

    List<IssueEvent> findByIssueIdOrderByCreatedAtAsc(UUID issueId);
}

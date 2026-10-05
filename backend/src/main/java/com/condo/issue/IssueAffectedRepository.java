package com.condo.issue;

import java.util.Collection;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface IssueAffectedRepository extends JpaRepository<IssueAffected, IssueAffected.Key> {

    List<IssueAffected> findByIdIssueId(UUID issueId);

    long countByIdIssueId(UUID issueId);

    @Query("select a.id.issueId from IssueAffected a where a.id.userId = :userId and a.id.issueId in :issueIds")
    Set<UUID> issuesAffecting(@Param("userId") UUID userId, @Param("issueIds") Collection<UUID> issueIds);
}

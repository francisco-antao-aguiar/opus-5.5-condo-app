package com.condo.issue;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface IssuePhotoRepository extends JpaRepository<IssuePhoto, UUID> {

    List<IssuePhoto> findByIssueIdOrderByCreatedAtAsc(UUID issueId);

    long countByIssueId(UUID issueId);

    Optional<IssuePhoto> findByIdAndIssueId(UUID id, UUID issueId);

    /** [issueId, count] */
    @Query("select p.issueId, count(p) from IssuePhoto p where p.issueId in :issueIds group by p.issueId")
    List<Object[]> countByIssueIds(@Param("issueIds") Collection<UUID> issueIds);
}

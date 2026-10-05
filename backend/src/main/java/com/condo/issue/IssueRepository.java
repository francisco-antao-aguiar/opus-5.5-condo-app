package com.condo.issue;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface IssueRepository extends JpaRepository<Issue, UUID> {

    Optional<Issue> findByIdAndBuildingId(UUID id, UUID buildingId);

    Optional<Issue> findByReporterUserIdAndClientRequestId(UUID reporterUserId, UUID clientRequestId);

    /** Candidates for list views; visibility and view filters are applied in the service. */
    @Query("select i from Issue i where i.buildingId = :buildingId and i.mergedIntoId is null "
            + "and i.status in :statuses")
    List<Issue> findListable(@Param("buildingId") UUID buildingId, @Param("statuses") Collection<IssueStatus> statuses);

    @Query("select i from Issue i where i.assetId = :assetId and i.mergedIntoId is null "
            + "and i.status <> com.condo.issue.IssueStatus.RESOLVED order by i.affectedCount desc, i.createdAt")
    List<Issue> findOpenOnAsset(@Param("assetId") UUID assetId);

    @Query("select i from Issue i where i.buildingId = :buildingId and i.mergedIntoId is null "
            + "and i.problemTypeId is null and i.otherTextNormalized is not null and i.assetId is not null")
    List<Issue> findUnclassifiedOtherTexts(@Param("buildingId") UUID buildingId);

    /** Any open issue located in the subtree rooted at the space with this materialized path? */
    @Query("select count(i) > 0 from Issue i, com.condo.space.Space s where i.spaceId = s.id "
            + "and s.buildingId = :buildingId and s.path like concat(:pathPrefix, '%') "
            + "and i.status <> com.condo.issue.IssueStatus.RESOLVED and i.mergedIntoId is null")
    boolean existsOpenInSubtree(@Param("buildingId") UUID buildingId, @Param("pathPrefix") String pathPrefix);
}

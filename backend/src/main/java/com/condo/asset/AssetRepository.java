package com.condo.asset;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface AssetRepository extends JpaRepository<Asset, UUID> {

    List<Asset> findByBuildingId(UUID buildingId);

    Optional<Asset> findByIdAndBuildingId(UUID id, UUID buildingId);

    /** [spaceId, count] of active assets per space. */
    @Query("select a.spaceId, count(a) from Asset a where a.buildingId = :buildingId and a.archivedAt is null "
            + "group by a.spaceId")
    List<Object[]> countActiveBySpace(@Param("buildingId") UUID buildingId);

    @Query("select count(a) from Asset a where a.spaceId = :spaceId and a.archivedAt is null")
    long countActiveInSpace(@Param("spaceId") UUID spaceId);

    /** Any active asset in the subtree rooted at the space with this materialized path? */
    @Query("select count(a) > 0 from Asset a, com.condo.space.Space s where a.spaceId = s.id "
            + "and s.buildingId = :buildingId and s.path like concat(:pathPrefix, '%') and a.archivedAt is null")
    boolean existsActiveInSubtree(@Param("buildingId") UUID buildingId, @Param("pathPrefix") String pathPrefix);
}

package com.condo.maintenance;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface MaintenancePlanRepository extends JpaRepository<MaintenancePlan, UUID> {

    List<MaintenancePlan> findByBuildingIdOrderByTitleAsc(UUID buildingId);

    Optional<MaintenancePlan> findByIdAndBuildingId(UUID id, UUID buildingId);

    @Query("select p.id from MaintenancePlan p where p.active = true and p.nextDueOn is not null")
    List<UUID> findSchedulableIds();

    /** Plans targeting a space in this subtree (blocks deleting it). */
    @Query("select count(p) > 0 from MaintenancePlan p, com.condo.space.Space s where p.spaceId = s.id "
            + "and s.buildingId = :buildingId and s.path like concat(:pathPrefix, '%')")
    boolean existsInSubtree(@Param("buildingId") UUID buildingId, @Param("pathPrefix") String pathPrefix);

    /** Archiving an asset pauses its plans; nobody should be sent to service a retired elevator. */
    @Modifying
    @Query("update MaintenancePlan p set p.active = false, "
            + "p.pausedReason = com.condo.maintenance.MaintenancePlan.PausedReason.ASSET_ARCHIVED, p.updatedAt = :now "
            + "where p.assetId = :assetId and p.active = true")
    int pauseForAsset(@Param("assetId") UUID assetId, @Param("now") Instant now);
}

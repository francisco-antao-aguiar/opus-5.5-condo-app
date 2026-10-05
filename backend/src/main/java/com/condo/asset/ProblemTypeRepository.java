package com.condo.asset;

import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ProblemTypeRepository extends JpaRepository<ProblemType, UUID> {

    /** Built-ins plus this building's own entries, active or not. */
    @Query("select p from ProblemType p where p.buildingId is null or p.buildingId = :buildingId "
            + "order by p.assetTypeCode, p.sortOrder, p.label")
    List<ProblemType> findForBuilding(@Param("buildingId") UUID buildingId);

    /** Entries with this label (case-insensitive) for the asset type in this building, built-in or own. */
    @Query("select p from ProblemType p where p.assetTypeCode = :type "
            + "and (p.buildingId is null or p.buildingId = :buildingId) and lower(p.label) = lower(:label)")
    List<ProblemType> findSameLabel(@Param("buildingId") UUID buildingId, @Param("type") String assetTypeCode,
            @Param("label") String label);

    @Query("select coalesce(max(p.sortOrder), 0) from ProblemType p where p.assetTypeCode = :type "
            + "and (p.buildingId is null or p.buildingId = :buildingId)")
    int maxSortOrder(@Param("buildingId") UUID buildingId, @Param("type") String assetTypeCode);
}

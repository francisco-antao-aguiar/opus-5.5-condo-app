package com.condo.space;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface SpaceRepository extends JpaRepository<Space, UUID> {

    List<Space> findByBuildingIdOrderByDepthAscSortOrderAscNameAsc(UUID buildingId);

    Optional<Space> findByIdAndBuildingId(UUID id, UUID buildingId);

    Optional<Space> findByBuildingIdAndParentIdIsNull(UUID buildingId);

    List<Space> findByBuildingIdInAndParentIdIsNull(Collection<UUID> buildingIds);

    boolean existsByParentId(UUID parentId);

    @Query("select coalesce(max(s.sortOrder), -1) from Space s where s.parentId = :parentId")
    int maxSortOrderUnder(@Param("parentId") UUID parentId);

    @Query("select s from Space s where s.buildingId = :buildingId and s.path like concat(:prefix, '%') "
            + "order by s.depth, s.sortOrder, s.name")
    List<Space> findSubtree(@Param("buildingId") UUID buildingId, @Param("prefix") String prefix);

    /** Rewrites the materialized path of a whole subtree in one statement after a move. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update Space s set s.path = concat(:newPrefix, substring(s.path, :oldPrefixLength + 1)), "
            + "s.depth = s.depth + :depthDelta "
            + "where s.buildingId = :buildingId and s.path like concat(:oldPrefix, '%')")
    int rebaseSubtree(@Param("buildingId") UUID buildingId, @Param("oldPrefix") String oldPrefix,
            @Param("oldPrefixLength") int oldPrefixLength, @Param("newPrefix") String newPrefix,
            @Param("depthDelta") int depthDelta);

    /** Children go with it through ON DELETE CASCADE on parent_id. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("delete from Space s where s.id = :id")
    void deleteNode(@Param("id") UUID id);
}

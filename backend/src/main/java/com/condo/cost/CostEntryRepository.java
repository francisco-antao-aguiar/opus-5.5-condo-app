package com.condo.cost;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface CostEntryRepository extends JpaRepository<CostEntry, UUID> {

    /** Live entries in a date range, newest first; other filters and privacy are applied in the service. */
    @Query("select c from CostEntry c where c.buildingId = :buildingId and c.deletedAt is null "
            + "and c.incurredOn >= :from and c.incurredOn <= :to order by c.incurredOn desc, c.createdAt desc")
    List<CostEntry> findLive(@Param("buildingId") UUID buildingId, @Param("from") LocalDate from,
            @Param("to") LocalDate to);

    Optional<CostEntry> findByIdAndBuildingIdAndDeletedAtIsNull(UUID id, UUID buildingId);
}

package com.condo.asset;

import java.util.Set;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ProblemTypeHiddenRepository extends JpaRepository<ProblemTypeHidden, ProblemTypeHidden.Key> {

    @Query("select h.id.problemTypeId from ProblemTypeHidden h where h.id.buildingId = :buildingId")
    Set<UUID> hiddenIds(@Param("buildingId") UUID buildingId);
}

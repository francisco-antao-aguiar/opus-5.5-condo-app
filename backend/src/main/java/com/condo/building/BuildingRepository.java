package com.condo.building;

import jakarta.persistence.LockModeType;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface BuildingRepository extends JpaRepository<Building, UUID> {

    /** Serializes issue numbering within one building. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select b from Building b where b.id = :id")
    Optional<Building> findByIdForUpdate(@Param("id") UUID id);
}

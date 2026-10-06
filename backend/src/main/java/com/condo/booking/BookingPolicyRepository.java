package com.condo.booking;

import jakarta.persistence.LockModeType;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface BookingPolicyRepository extends JpaRepository<BookingPolicy, UUID> {

    List<BookingPolicy> findByBuildingId(UUID buildingId);

    /** Serializes requests and approvals per space so two overlapping requests can't both get in. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select p from BookingPolicy p where p.spaceId = :spaceId")
    Optional<BookingPolicy> findForUpdate(@Param("spaceId") UUID spaceId);
}

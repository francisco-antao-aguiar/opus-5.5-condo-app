package com.condo.member;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface MembershipRepository extends JpaRepository<Membership, UUID> {

    @Query("select m from Membership m join fetch m.building left join fetch m.unitSpace "
            + "where m.building.id = :buildingId and m.user.id = :userId")
    Optional<Membership> findByBuildingAndUser(@Param("buildingId") UUID buildingId, @Param("userId") UUID userId);

    @Query("select m from Membership m join fetch m.building left join fetch m.unitSpace "
            + "where m.user.id = :userId and m.status = com.condo.member.MembershipStatus.ACTIVE "
            + "and (m.expiresAt is null or m.expiresAt > :now) order by m.building.name")
    List<Membership> findActiveByUser(@Param("userId") UUID userId, @Param("now") Instant now);

    @Query("select m from Membership m join fetch m.user left join fetch m.unitSpace left join fetch m.invitedBy "
            + "where m.building.id = :buildingId order by m.user.displayName")
    List<Membership> findByBuildingWithUsers(@Param("buildingId") UUID buildingId);

    @Query("select m from Membership m join fetch m.building join fetch m.user left join fetch m.unitSpace "
            + "where m.id = :id and m.building.id = :buildingId")
    Optional<Membership> findInBuilding(@Param("id") UUID id, @Param("buildingId") UUID buildingId);

    @Query("select count(m) from Membership m where m.building.id = :buildingId and m.roleCode = 'ADMIN' "
            + "and m.status = com.condo.member.MembershipStatus.ACTIVE "
            + "and (m.expiresAt is null or m.expiresAt > :now)")
    long countActiveAdmins(@Param("buildingId") UUID buildingId, @Param("now") Instant now);

    /** Persists expiry for reporting. Access itself already ends at expiresAt (see Membership#isActiveAt). */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update Membership m set m.status = com.condo.member.MembershipStatus.EXPIRED, m.updatedAt = :now "
            + "where m.status = com.condo.member.MembershipStatus.ACTIVE and m.expiresAt is not null "
            + "and m.expiresAt <= :now")
    int markExpired(@Param("now") Instant now);
}

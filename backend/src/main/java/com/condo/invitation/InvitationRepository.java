package com.condo.invitation;

import jakarta.persistence.LockModeType;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface InvitationRepository extends JpaRepository<Invitation, UUID> {

    boolean existsByCode(String code);

    @Query("select i from Invitation i join fetch i.building left join fetch i.unitSpace "
            + "join fetch i.createdBy cb join fetch cb.user where i.code = :code")
    Optional<Invitation> findByCode(@Param("code") String code);

    /** Row lock so concurrent accepts of a multi-use invitation can't exceed maxUses. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select i from Invitation i where i.code = :code")
    Optional<Invitation> findByCodeForUpdate(@Param("code") String code);

    @Query("select i from Invitation i left join fetch i.unitSpace join fetch i.createdBy cb join fetch cb.user "
            + "where i.building.id = :buildingId order by i.createdAt desc")
    List<Invitation> findByBuilding(@Param("buildingId") UUID buildingId);

    @Query("select i from Invitation i left join fetch i.unitSpace join fetch i.createdBy cb join fetch cb.user "
            + "where i.id = :id and i.building.id = :buildingId")
    Optional<Invitation> findInBuilding(@Param("id") UUID id, @Param("buildingId") UUID buildingId);
}

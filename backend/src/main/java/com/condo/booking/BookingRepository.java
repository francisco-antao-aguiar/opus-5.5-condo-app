package com.condo.booking;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface BookingRepository extends JpaRepository<Booking, UUID> {

    Optional<Booking> findByIdAndBuildingId(UUID id, UUID buildingId);

    /** Live (pending or confirmed) bookings on a space overlapping [from, to). */
    @Query("select b from Booking b where b.spaceId = :spaceId and b.startsAt < :to and b.endsAt > :from "
            + "and b.status in (com.condo.booking.Booking.Status.PENDING, com.condo.booking.Booking.Status.CONFIRMED) "
            + "order by b.startsAt")
    List<Booking> findLiveOverlapping(@Param("spaceId") UUID spaceId, @Param("from") Instant from,
            @Param("to") Instant to);

    @Query("select b from Booking b where b.buildingId = :buildingId and b.startsAt < :to and b.endsAt > :from "
            + "order by b.startsAt")
    List<Booking> findInRange(@Param("buildingId") UUID buildingId, @Param("from") Instant from,
            @Param("to") Instant to);

    /** Upcoming live bookings of a unit on a space — the per-unit fairness limit. */
    @Query("select count(b) from Booking b where b.spaceId = :spaceId and b.unitSpaceId = :unitId and b.endsAt > :now "
            + "and b.status in (com.condo.booking.Booking.Status.PENDING, com.condo.booking.Booking.Status.CONFIRMED)")
    long countUpcomingForUnit(@Param("spaceId") UUID spaceId, @Param("unitId") UUID unitId, @Param("now") Instant now);

    /** Same limit for members without a unit (admins, managers). */
    @Query("select count(b) from Booking b where b.spaceId = :spaceId and b.membershipId = :membershipId "
            + "and b.endsAt > :now "
            + "and b.status in (com.condo.booking.Booking.Status.PENDING, com.condo.booking.Booking.Status.CONFIRMED)")
    long countUpcomingForMembership(@Param("spaceId") UUID spaceId, @Param("membershipId") UUID membershipId,
            @Param("now") Instant now);

    @Query("select count(b) > 0 from Booking b, com.condo.space.Space s where b.spaceId = s.id "
            + "and s.buildingId = :buildingId and s.path like concat(:pathPrefix, '%') and b.endsAt > :now "
            + "and b.status in (com.condo.booking.Booking.Status.PENDING, com.condo.booking.Booking.Status.CONFIRMED)")
    boolean existsUpcomingInSubtree(@Param("buildingId") UUID buildingId, @Param("pathPrefix") String pathPrefix,
            @Param("now") Instant now);

    @Query("select b from Booking b where b.status = com.condo.booking.Booking.Status.PENDING and b.startsAt <= :now")
    List<Booking> findPendingStarted(@Param("now") Instant now);

    @Query("select b from Booking b where b.status = com.condo.booking.Booking.Status.PENDING "
            + "and b.remindedAt is null and b.createdAt <= :cutoff and b.startsAt > :now")
    List<Booking> findPendingNeedingReminder(@Param("cutoff") Instant cutoff, @Param("now") Instant now);

    /** Future live bookings whose membership no longer grants access (revoked or expired). */
    @Query("select b from Booking b, com.condo.member.Membership m where b.membershipId = m.id and b.endsAt > :now "
            + "and b.status in (com.condo.booking.Booking.Status.PENDING, com.condo.booking.Booking.Status.CONFIRMED) "
            + "and (m.status <> com.condo.member.MembershipStatus.ACTIVE or (m.expiresAt is not null and m.expiresAt <= :now))")
    List<Booking> findLiveOfInactiveMembers(@Param("now") Instant now);

    @Query("select b from Booking b where b.userId = :userId "
            + "and b.status = com.condo.booking.Booking.Status.CONFIRMED and b.endsAt > :since order by b.startsAt")
    List<Booking> findConfirmedOfUser(@Param("userId") UUID userId, @Param("since") Instant since);
}

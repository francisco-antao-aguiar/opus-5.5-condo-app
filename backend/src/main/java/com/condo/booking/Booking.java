package com.condo.booking;

import com.condo.common.persistence.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import org.hibernate.annotations.OptimisticLock;

/** A request to use a space for a time range. PENDING holds the slot until an admin decides. */
@Entity
@Table(name = "booking")
public class Booking extends BaseEntity {

    public enum Status { PENDING, CONFIRMED, REJECTED, CANCELLED }

    @Column(name = "building_id", nullable = false)
    private UUID buildingId;

    @Column(name = "space_id", nullable = false)
    private UUID spaceId;

    @Column(name = "membership_id", nullable = false)
    private UUID membershipId;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "unit_space_id")
    private UUID unitSpaceId;

    @Column(name = "starts_at", nullable = false)
    private Instant startsAt;

    @Column(name = "ends_at", nullable = false)
    private Instant endsAt;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private Status status = Status.PENDING;

    @Column(length = 500)
    private String note;

    @Column(name = "decision_note", length = 500)
    private String decisionNote;

    @Column(name = "decided_by_user_id")
    private UUID decidedByUserId;

    @Column(name = "decided_at")
    private Instant decidedAt;

    @Column(name = "cancelled_by_user_id")
    private UUID cancelledByUserId;

    @Column(name = "cancelled_at")
    private Instant cancelledAt;

    @OptimisticLock(excluded = true)
    @Column(name = "reminded_at")
    private Instant remindedAt;

    protected Booking() {
    }

    public Booking(UUID buildingId, UUID spaceId, UUID membershipId, UUID userId, UUID unitSpaceId, Instant startsAt,
            Instant endsAt, String note) {
        this.buildingId = buildingId;
        this.spaceId = spaceId;
        this.membershipId = membershipId;
        this.userId = userId;
        this.unitSpaceId = unitSpaceId;
        this.startsAt = startsAt;
        this.endsAt = endsAt;
        this.note = note;
    }

    /** PENDING or CONFIRMED: holds its slot. */
    public boolean isLive() {
        return status == Status.PENDING || status == Status.CONFIRMED;
    }

    public void approve(UUID by, String note, Instant now) {
        decide(Status.CONFIRMED, by, note, now);
    }

    public void reject(UUID by, String note, Instant now) {
        decide(Status.REJECTED, by, note, now);
    }

    public void cancel(UUID by, String note, Instant now) {
        requireLive();
        status = Status.CANCELLED;
        cancelledByUserId = by;
        cancelledAt = now;
        if (note != null) {
            decisionNote = note;
        }
    }

    public void markReminded(Instant now) {
        remindedAt = now;
    }

    private void decide(Status to, UUID by, String note, Instant now) {
        if (status != Status.PENDING) {
            throw new IllegalStateException("Only pending bookings can be decided");
        }
        status = to;
        decidedByUserId = by;
        decidedAt = now;
        decisionNote = note;
    }

    private void requireLive() {
        if (!isLive()) {
            throw new IllegalStateException("Booking is already " + status);
        }
    }

    public UUID getBuildingId() {
        return buildingId;
    }

    public UUID getSpaceId() {
        return spaceId;
    }

    public UUID getMembershipId() {
        return membershipId;
    }

    public UUID getUserId() {
        return userId;
    }

    public UUID getUnitSpaceId() {
        return unitSpaceId;
    }

    public Instant getStartsAt() {
        return startsAt;
    }

    public Instant getEndsAt() {
        return endsAt;
    }

    public Status getStatus() {
        return status;
    }

    public String getNote() {
        return note;
    }

    public String getDecisionNote() {
        return decisionNote;
    }

    public UUID getDecidedByUserId() {
        return decidedByUserId;
    }

    public Instant getDecidedAt() {
        return decidedAt;
    }

    public Instant getRemindedAt() {
        return remindedAt;
    }
}

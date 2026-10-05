package com.condo.invitation;

import com.condo.building.Building;
import com.condo.common.persistence.BaseEntity;
import com.condo.member.Membership;
import com.condo.space.Space;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.Duration;
import java.time.Instant;

/**
 * A code that lets people join a building with a given role (and optionally a unit and a membership end date).
 * Single-use when {@code maxUses == 1}. Its status is derived, never stored, so it can't drift.
 */
@Entity
@Table(name = "invitation")
public class Invitation extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "building_id", nullable = false)
    private Building building;

    @Column(nullable = false, length = 16)
    private String code;

    @Column(name = "role_code", nullable = false, length = 32)
    private String roleCode;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "unit_space_id")
    private Space unitSpace;

    /** The issuer's membership; their right to invite is re-checked when the invitation is used. */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "created_by_membership_id", nullable = false)
    private Membership createdBy;

    @Column(name = "max_uses", nullable = false)
    private int maxUses;

    @Column(name = "use_count", nullable = false)
    private int useCount;

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    /** Fixed end of the resulting membership… */
    @Column(name = "membership_expires_at")
    private Instant membershipExpiresAt;

    /** …or its length counted from acceptance. Never both. */
    @Column(name = "membership_duration_days")
    private Integer membershipDurationDays;

    @Column(length = 200)
    private String note;

    @Column(name = "revoked_at")
    private Instant revokedAt;

    protected Invitation() {
    }

    public Invitation(Building building, String code, String roleCode, Space unitSpace, Membership createdBy,
            int maxUses, Instant expiresAt, Instant membershipExpiresAt, String note) {
        this(building, code, roleCode, unitSpace, createdBy, maxUses, expiresAt, membershipExpiresAt, null, note);
    }

    public Invitation(Building building, String code, String roleCode, Space unitSpace, Membership createdBy,
            int maxUses, Instant expiresAt, Instant membershipExpiresAt, Integer membershipDurationDays,
            String note) {
        if (maxUses < 1) {
            throw new IllegalArgumentException("maxUses must be >= 1");
        }
        if (membershipExpiresAt != null && membershipDurationDays != null) {
            throw new IllegalArgumentException("Set a membership end date or a duration, not both");
        }
        if (membershipDurationDays != null && membershipDurationDays < 1) {
            throw new IllegalArgumentException("membershipDurationDays must be >= 1");
        }
        this.membershipDurationDays = membershipDurationDays;
        this.building = building;
        this.code = code;
        this.roleCode = roleCode;
        this.unitSpace = unitSpace;
        this.createdBy = createdBy;
        this.maxUses = maxUses;
        this.expiresAt = expiresAt;
        this.membershipExpiresAt = membershipExpiresAt;
        this.note = note;
    }

    /** Revocation wins over expiry, which wins over exhaustion: the most "final" reason is reported. */
    public InvitationStatus statusAt(Instant now) {
        if (revokedAt != null) {
            return InvitationStatus.REVOKED;
        }
        if (!expiresAt.isAfter(now)) {
            return InvitationStatus.EXPIRED;
        }
        if (useCount >= maxUses) {
            return InvitationStatus.EXHAUSTED;
        }
        return InvitationStatus.ACTIVE;
    }

    /** Uses one slot. Callers must hold the row lock and have checked {@link #statusAt}. */
    public void consume(Instant now) {
        if (statusAt(now) != InvitationStatus.ACTIVE) {
            throw new IllegalStateException("Invitation " + getId() + " is not usable");
        }
        useCount++;
    }

    /** End of the membership someone accepting at {@code acceptedAt} gets; null = no end. */
    public Instant membershipExpiryFor(Instant acceptedAt) {
        if (membershipDurationDays != null) {
            return acceptedAt.plus(Duration.ofDays(membershipDurationDays));
        }
        return membershipExpiresAt;
    }

    public void revoke(Instant now) {
        if (revokedAt == null) {
            revokedAt = now;
        }
    }

    public Building getBuilding() {
        return building;
    }

    public String getCode() {
        return code;
    }

    public String getRoleCode() {
        return roleCode;
    }

    public Space getUnitSpace() {
        return unitSpace;
    }

    public Membership getCreatedBy() {
        return createdBy;
    }

    public int getMaxUses() {
        return maxUses;
    }

    public int getUseCount() {
        return useCount;
    }

    public Instant getExpiresAt() {
        return expiresAt;
    }

    public Instant getMembershipExpiresAt() {
        return membershipExpiresAt;
    }

    public Integer getMembershipDurationDays() {
        return membershipDurationDays;
    }

    public String getNote() {
        return note;
    }

    public Instant getRevokedAt() {
        return revokedAt;
    }
}

package com.condo.member;

import com.condo.auth.User;
import com.condo.building.Building;
import com.condo.common.persistence.BaseEntity;
import com.condo.space.Space;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.Instant;

/** A user's role in one building, optionally tied to a unit, optionally time-limited. */
@Entity
@Table(name = "membership")
public class Membership extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "building_id", nullable = false)
    private Building building;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(name = "role_code", nullable = false, length = 32)
    private String roleCode;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "unit_space_id")
    private Space unitSpace;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private MembershipStatus status = MembershipStatus.ACTIVE;

    @Column(name = "expires_at")
    private Instant expiresAt;

    @Column(name = "revoked_at")
    private Instant revokedAt;

    protected Membership() {
    }

    public Membership(Building building, User user, String roleCode, Space unitSpace, Instant expiresAt) {
        this.building = building;
        this.user = user;
        this.roleCode = roleCode;
        this.unitSpace = unitSpace;
        this.expiresAt = expiresAt;
    }

    /** The only definition of "has access right now". Expiry needs no background job to take effect. */
    public boolean isActiveAt(Instant now) {
        return status == MembershipStatus.ACTIVE && (expiresAt == null || expiresAt.isAfter(now));
    }

    public MembershipStatus effectiveStatus(Instant now) {
        if (status == MembershipStatus.ACTIVE && !isActiveAt(now)) {
            return MembershipStatus.EXPIRED;
        }
        return status;
    }

    public void revoke(Instant now) {
        status = MembershipStatus.REVOKED;
        revokedAt = now;
    }

    public void update(String roleCode, Space unitSpace, Instant expiresAt) {
        this.roleCode = roleCode;
        this.unitSpace = unitSpace;
        this.expiresAt = expiresAt;
    }

    public Building getBuilding() {
        return building;
    }

    public User getUser() {
        return user;
    }

    public String getRoleCode() {
        return roleCode;
    }

    public Space getUnitSpace() {
        return unitSpace;
    }

    public MembershipStatus getStatus() {
        return status;
    }

    public Instant getExpiresAt() {
        return expiresAt;
    }

    public Instant getRevokedAt() {
        return revokedAt;
    }
}

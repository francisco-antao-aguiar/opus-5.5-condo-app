package com.condo.common.persistence;

import jakarta.persistence.Column;
import jakarta.persistence.Id;
import jakarta.persistence.MappedSuperclass;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Version;
import java.time.Instant;
import java.util.UUID;
import org.hibernate.Hibernate;
import org.hibernate.annotations.OptimisticLock;

/**
 * UUIDs are assigned in Java (not by the DB) so an entity has its id before persist — the space tree
 * needs it to build its materialized path. The null-able {@code version} tells Spring Data the entity is new.
 */
@MappedSuperclass
public abstract class BaseEntity {

    @Id
    private UUID id = UUID.randomUUID();

    @Version
    private Long version;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    /**
     * Excluded from optimistic locking: it only ever changes together with another field, and fields that are
     * themselves excluded (counters like Issue#affectedCount) must not bump the version through it.
     */
    @OptimisticLock(excluded = true)
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @PrePersist
    void onPersist() {
        Instant now = Instant.now();
        if (createdAt == null) {
            createdAt = now;
        }
        updatedAt = now;
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = Instant.now();
    }

    /** For entities whose creation time is a business fact taken from the injected clock (or backdated seeds). */
    protected void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }

    public UUID getId() {
        return id;
    }

    public Long getVersion() {
        return version;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    @Override
    public final boolean equals(Object o) {
        if (this == o) {
            return true;
        }
        if (o == null || Hibernate.getClass(this) != Hibernate.getClass(o)) {
            return false;
        }
        return id.equals(((BaseEntity) o).getId());
    }

    @Override
    public final int hashCode() {
        return id.hashCode();
    }
}

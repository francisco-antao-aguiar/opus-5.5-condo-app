package com.condo.asset;

import com.condo.common.persistence.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

/**
 * A physical thing that can break (a light, the elevator, a boiler) attached to any space. Its id never changes —
 * QR labels encode it — and it is archived rather than deleted so issue history and printed labels keep working.
 */
@Entity
@Table(name = "asset")
public class Asset extends BaseEntity {

    @Column(name = "building_id", nullable = false)
    private UUID buildingId;

    /** Null only for archived assets whose space was later deleted. */
    @Column(name = "space_id")
    private UUID spaceId;

    @Column(name = "asset_type_code", nullable = false, length = 32)
    private String assetTypeCode;

    @Column(nullable = false, length = 120)
    private String name;

    @Column(length = 500)
    private String notes;

    @Column(name = "archived_at")
    private Instant archivedAt;

    protected Asset() {
    }

    public Asset(UUID buildingId, UUID spaceId, String assetTypeCode, String name, String notes) {
        this.buildingId = buildingId;
        this.spaceId = spaceId;
        this.assetTypeCode = assetTypeCode;
        this.name = name;
        this.notes = notes;
    }

    public void update(UUID spaceId, String assetTypeCode, String name, String notes) {
        requireActive();
        this.spaceId = spaceId;
        this.assetTypeCode = assetTypeCode;
        this.name = name;
        this.notes = notes;
    }

    public boolean isArchived() {
        return archivedAt != null;
    }

    public void archive(Instant now) {
        if (archivedAt == null) {
            archivedAt = now;
        }
    }

    public void restore() {
        if (spaceId == null) {
            throw new IllegalStateException("Cannot restore an asset without a space");
        }
        archivedAt = null;
    }

    private void requireActive() {
        if (isArchived()) {
            throw new IllegalStateException("Archived assets are read-only");
        }
    }

    public UUID getBuildingId() {
        return buildingId;
    }

    public UUID getSpaceId() {
        return spaceId;
    }

    public String getAssetTypeCode() {
        return assetTypeCode;
    }

    public String getName() {
        return name;
    }

    public String getNotes() {
        return notes;
    }

    public Instant getArchivedAt() {
        return archivedAt;
    }
}

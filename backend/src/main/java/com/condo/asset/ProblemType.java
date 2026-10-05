package com.condo.asset;

import com.condo.common.persistence.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.util.UUID;

/**
 * A reportable problem for an asset type. {@code buildingId == null} = built-in (seeded, fixed id, shared by all
 * buildings, can be hidden per building); otherwise a building's own entry. Never deleted, only deactivated,
 * because issues reference them.
 */
@Entity
@Table(name = "problem_type")
public class ProblemType extends BaseEntity {

    @Column(name = "asset_type_code", nullable = false, length = 32)
    private String assetTypeCode;

    @Column(name = "building_id")
    private UUID buildingId;

    @Column(nullable = false, length = 120)
    private String label;

    @Column(name = "sort_order", nullable = false)
    private int sortOrder;

    @Column(nullable = false)
    private boolean active = true;

    protected ProblemType() {
    }

    public static ProblemType custom(UUID buildingId, String assetTypeCode, String label, int sortOrder) {
        ProblemType p = new ProblemType();
        p.buildingId = buildingId;
        p.assetTypeCode = assetTypeCode;
        p.label = label;
        p.sortOrder = sortOrder;
        return p;
    }

    public boolean isBuiltIn() {
        return buildingId == null;
    }

    /** Visible to the given building at all (built-ins are, other buildings' custom entries aren't). */
    public boolean belongsTo(UUID building) {
        return buildingId == null || buildingId.equals(building);
    }

    public void update(String label, int sortOrder, boolean active) {
        if (isBuiltIn()) {
            throw new IllegalStateException("Built-in problem types are immutable");
        }
        this.label = label;
        this.sortOrder = sortOrder;
        this.active = active;
    }

    public String getAssetTypeCode() {
        return assetTypeCode;
    }

    public UUID getBuildingId() {
        return buildingId;
    }

    public String getLabel() {
        return label;
    }

    public int getSortOrder() {
        return sortOrder;
    }

    public boolean isActive() {
        return active;
    }
}

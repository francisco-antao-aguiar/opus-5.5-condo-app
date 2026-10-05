package com.condo.space;

import com.condo.common.persistence.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import java.util.UUID;

/**
 * A node of the building's location tree. {@code parentId} is the source of truth; {@code path}
 * ({@code /rootId/.../ownId/}) and {@code depth} are maintained alongside for cheap subtree queries and
 * "is X inside Y" checks. {@code visibility == null} means "inherit from parent".
 */
@Entity
@Table(name = "space")
public class Space extends BaseEntity {

    @Column(name = "building_id", nullable = false)
    private UUID buildingId;

    @Column(name = "parent_id")
    private UUID parentId;

    @Enumerated(EnumType.STRING)
    @Column(name = "space_type", nullable = false, length = 32)
    private SpaceType type;

    @Column(nullable = false, length = 200)
    private String name;

    @Column(name = "sort_order", nullable = false)
    private int sortOrder;

    @Enumerated(EnumType.STRING)
    @Column(length = 16)
    private Visibility visibility;

    @Column(nullable = false, length = 1024)
    private String path;

    @Column(nullable = false)
    private int depth;

    protected Space() {
    }

    public static Space root(UUID buildingId, String name) {
        Space s = new Space();
        s.buildingId = buildingId;
        s.type = SpaceType.BUILDING;
        s.name = name;
        s.visibility = Visibility.COMMON;
        s.path = "/" + s.getId() + "/";
        s.depth = 0;
        return s;
    }

    public static Space childOf(Space parent, SpaceType type, String name, int sortOrder, Visibility visibility) {
        Space s = new Space();
        // Getters, not fields: parent may be a lazy Hibernate proxy whose fields are unset.
        s.buildingId = parent.getBuildingId();
        s.parentId = parent.getId();
        s.type = type;
        s.name = name;
        s.sortOrder = sortOrder;
        s.visibility = visibility;
        s.path = parent.getPath() + s.getId() + "/";
        s.depth = parent.getDepth() + 1;
        return s;
    }

    public boolean isRoot() {
        return parentId == null;
    }

    /** True if this node is {@code other} or one of its descendants. ({@code other} may be a lazy proxy.) */
    public boolean isWithin(Space other) {
        return buildingId.equals(other.getBuildingId()) && path.startsWith(other.getPath());
    }

    /** Re-parents this node; the caller must rebase descendants' paths. */
    void reparent(Space newParent) {
        this.parentId = newParent.getId();
        this.path = newParent.getPath() + getId() + "/";
        this.depth = newParent.getDepth() + 1;
    }

    public void update(String name, SpaceType type, Visibility visibility, int sortOrder) {
        this.name = name;
        this.type = type;
        this.visibility = visibility;
        this.sortOrder = sortOrder;
    }

    public void setSortOrder(int sortOrder) {
        this.sortOrder = sortOrder;
    }

    public void setName(String name) {
        this.name = name;
    }

    public UUID getBuildingId() {
        return buildingId;
    }

    public UUID getParentId() {
        return parentId;
    }

    public SpaceType getType() {
        return type;
    }

    public String getName() {
        return name;
    }

    public int getSortOrder() {
        return sortOrder;
    }

    public Visibility getVisibility() {
        return visibility;
    }

    public String getPath() {
        return path;
    }

    public int getDepth() {
        return depth;
    }
}

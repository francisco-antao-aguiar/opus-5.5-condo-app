package com.condo.asset;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** Reference data (light, elevator, boiler…). New types are rows, like roles. */
@Entity
@Table(name = "asset_type")
public class AssetType {

    @Id
    @Column(length = 32)
    private String code;

    @Column(nullable = false, length = 64)
    private String name;

    @Column(nullable = false, length = 32)
    private String icon;

    @Column(name = "sort_order", nullable = false)
    private int sortOrder;

    protected AssetType() {
    }

    public String getCode() {
        return code;
    }

    public String getName() {
        return name;
    }

    public String getIcon() {
        return icon;
    }

    public int getSortOrder() {
        return sortOrder;
    }
}

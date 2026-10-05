package com.condo.building;

import com.condo.common.persistence.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

@Entity
@Table(name = "building")
public class Building extends BaseEntity {

    @Column(nullable = false, length = 200)
    private String name;

    @Column(length = 500)
    private String address;

    /** Code of a {@link com.condo.governance.GovernanceMode}; selects the permission preset. */
    @Column(name = "governance_mode", nullable = false, length = 32)
    private String governanceMode;

    protected Building() {
    }

    public Building(String name, String address, String governanceMode) {
        this.name = name;
        this.address = address;
        this.governanceMode = governanceMode;
    }

    public void update(String name, String address, String governanceMode) {
        this.name = name;
        this.address = address;
        this.governanceMode = governanceMode;
    }

    public String getName() {
        return name;
    }

    public String getAddress() {
        return address;
    }

    public String getGovernanceMode() {
        return governanceMode;
    }
}

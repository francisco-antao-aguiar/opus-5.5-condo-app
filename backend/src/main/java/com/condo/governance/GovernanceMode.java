package com.condo.governance;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** A named preset of permission policy rows (MANAGED, OPEN, …). */
@Entity
@Table(name = "governance_mode")
public class GovernanceMode {

    public static final String MANAGED = "MANAGED";
    public static final String OPEN = "OPEN";

    @Id
    @Column(length = 32)
    private String code;

    @Column(nullable = false, length = 64)
    private String name;

    @Column(nullable = false, length = 500)
    private String description;

    protected GovernanceMode() {
    }

    public GovernanceMode(String code, String name, String description) {
        this.code = code;
        this.name = name;
        this.description = description;
    }

    public String getCode() {
        return code;
    }

    public String getName() {
        return name;
    }

    public String getDescription() {
        return description;
    }
}

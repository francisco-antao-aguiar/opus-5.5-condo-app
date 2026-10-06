package com.condo.building;

import com.condo.common.persistence.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import org.hibernate.annotations.OptimisticLock;

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

    /** IANA zone: maintenance due dates and booking hours are local to it. */
    @Column(name = "time_zone", nullable = false, length = 64)
    private String timeZone = "Europe/Lisbon";

    /** ISO 4217 default for new cost entries (amounts store their own currency). */
    @Column(nullable = false, length = 3)
    private String currency = "EUR";

    /** Last issue number handed out. Excluded from optimistic locking: reports mustn't conflict with settings edits. */
    @OptimisticLock(excluded = true)
    @Column(name = "issue_seq", nullable = false)
    private int issueSeq;

    protected Building() {
    }

    public Building(String name, String address, String governanceMode) {
        this.name = name;
        this.address = address;
        this.governanceMode = governanceMode;
    }

    public Building(String name, String address, String governanceMode, String timeZone, String currency) {
        this(name, address, governanceMode);
        this.timeZone = timeZone;
        this.currency = currency;
    }

    public void setLocale(String timeZone, String currency) {
        this.timeZone = timeZone;
        this.currency = currency;
    }

    public java.time.ZoneId zone() {
        return java.time.ZoneId.of(timeZone);
    }

    public String getTimeZone() {
        return timeZone;
    }

    public String getCurrency() {
        return currency;
    }

    public void update(String name, String address, String governanceMode) {
        this.name = name;
        this.address = address;
        this.governanceMode = governanceMode;
    }

    /** Caller must hold the building row lock (BuildingRepository#findByIdForUpdate). */
    public int nextIssueNumber() {
        return ++issueSeq;
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

package com.condo.cost;

import com.condo.common.persistence.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

/** Money the building spent, optionally tied to an issue, maintenance plan, asset and/or space. */
@Entity
@Table(name = "cost_entry")
public class CostEntry extends BaseEntity {

    public enum Category { REPAIR, MAINTENANCE, CLEANING, UTILITIES, INSURANCE, OTHER }

    @Column(name = "building_id", nullable = false)
    private UUID buildingId;

    @Column(nullable = false, precision = 19, scale = 4)
    private BigDecimal amount;

    @Column(nullable = false, length = 3)
    private String currency;

    @Column(name = "incurred_on", nullable = false)
    private LocalDate incurredOn;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    private Category category;

    @Column(nullable = false, length = 500)
    private String description;

    @Column(length = 160)
    private String vendor;

    @Column(name = "issue_id")
    private UUID issueId;

    @Column(name = "maintenance_plan_id")
    private UUID maintenancePlanId;

    @Column(name = "asset_id")
    private UUID assetId;

    @Column(name = "space_id")
    private UUID spaceId;

    @Column(name = "receipt_storage_key", length = 255)
    private String receiptStorageKey;

    @Column(name = "receipt_content_type", length = 64)
    private String receiptContentType;

    @Column(name = "created_by_user_id", nullable = false)
    private UUID createdByUserId;

    @Column(name = "deleted_at")
    private Instant deletedAt;

    @Column(name = "delete_reason", length = 300)
    private String deleteReason;

    protected CostEntry() {
    }

    public CostEntry(UUID buildingId, UUID createdByUserId) {
        this.buildingId = buildingId;
        this.createdByUserId = createdByUserId;
    }

    /** Full replace of the editable fields. */
    public void define(Money money, LocalDate incurredOn, Category category, String description, String vendor,
            UUID issueId, UUID maintenancePlanId, UUID assetId, UUID spaceId) {
        this.amount = money.amount();
        this.currency = money.code();
        this.incurredOn = incurredOn;
        this.category = category;
        this.description = description;
        this.vendor = vendor;
        this.issueId = issueId;
        this.maintenancePlanId = maintenancePlanId;
        this.assetId = assetId;
        this.spaceId = spaceId;
    }

    public void attachReceipt(String storageKey, String contentType) {
        this.receiptStorageKey = storageKey;
        this.receiptContentType = contentType;
    }

    /** Soft delete with a reason: costs are an audit trail. */
    public void delete(String reason, Instant now) {
        this.deletedAt = now;
        this.deleteReason = reason;
    }

    public boolean isDeleted() {
        return deletedAt != null;
    }

    public Money money() {
        return new Money(amount, Money.currency(currency));
    }

    public UUID getBuildingId() {
        return buildingId;
    }

    public LocalDate getIncurredOn() {
        return incurredOn;
    }

    public Category getCategory() {
        return category;
    }

    public String getDescription() {
        return description;
    }

    public String getVendor() {
        return vendor;
    }

    public UUID getIssueId() {
        return issueId;
    }

    public UUID getMaintenancePlanId() {
        return maintenancePlanId;
    }

    public UUID getAssetId() {
        return assetId;
    }

    public UUID getSpaceId() {
        return spaceId;
    }

    public String getReceiptStorageKey() {
        return receiptStorageKey;
    }

    public String getReceiptContentType() {
        return receiptContentType;
    }

    public UUID getCreatedByUserId() {
        return createdByUserId;
    }
}

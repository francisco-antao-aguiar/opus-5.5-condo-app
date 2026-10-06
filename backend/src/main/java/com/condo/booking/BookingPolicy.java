package com.condo.booking;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.hibernate.annotations.OptimisticLock;

/** Makes a space bookable and holds its rules. Keyed by the space itself. */
@Entity
@Table(name = "booking_policy")
public class BookingPolicy {

    private static final ObjectMapper JSON = new ObjectMapper();

    @Id
    @Column(name = "space_id")
    private UUID spaceId;

    @Version
    private Long version;

    @Column(name = "building_id", nullable = false)
    private UUID buildingId;

    @Column(nullable = false)
    private boolean enabled = true;

    @Column(name = "slot_minutes", nullable = false)
    private int slotMinutes;

    @Column(name = "min_minutes", nullable = false)
    private int minMinutes;

    @Column(name = "max_minutes", nullable = false)
    private int maxMinutes;

    @Column(name = "opening_hours", nullable = false, length = 2000)
    private String openingHoursJson;

    @Column(name = "advance_days", nullable = false)
    private int advanceDays;

    @Column(name = "max_active_per_unit")
    private Integer maxActivePerUnit;

    @Column(name = "cancel_cutoff_hours", nullable = false)
    private int cancelCutoffHours;

    @Column(name = "rules_text", length = 2000)
    private String rulesText;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @OptimisticLock(excluded = true)
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected BookingPolicy() {
    }

    public BookingPolicy(UUID spaceId, UUID buildingId) {
        this.spaceId = spaceId;
        this.buildingId = buildingId;
    }

    @PrePersist
    void onPersist() {
        createdAt = updatedAt = Instant.now();
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = Instant.now();
    }

    public void define(boolean enabled, int slotMinutes, int minMinutes, int maxMinutes, OpeningHours hours,
            int advanceDays, Integer maxActivePerUnit, int cancelCutoffHours, String rulesText) {
        this.enabled = enabled;
        this.slotMinutes = slotMinutes;
        this.minMinutes = minMinutes;
        this.maxMinutes = maxMinutes;
        try {
            this.openingHoursJson = JSON.writeValueAsString(hours.toJson());
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
        this.advanceDays = advanceDays;
        this.maxActivePerUnit = maxActivePerUnit;
        this.cancelCutoffHours = cancelCutoffHours;
        this.rulesText = rulesText;
    }

    public OpeningHours openingHours() {
        try {
            return OpeningHours.parse(JSON.readValue(openingHoursJson,
                    new TypeReference<Map<String, List<List<String>>>>() { }));
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Corrupt opening hours for space " + spaceId, e);
        }
    }

    public UUID getSpaceId() {
        return spaceId;
    }

    public Long getVersion() {
        return version;
    }

    public UUID getBuildingId() {
        return buildingId;
    }

    public boolean isEnabled() {
        return enabled;
    }

    public int getSlotMinutes() {
        return slotMinutes;
    }

    public int getMinMinutes() {
        return minMinutes;
    }

    public int getMaxMinutes() {
        return maxMinutes;
    }

    public int getAdvanceDays() {
        return advanceDays;
    }

    public Integer getMaxActivePerUnit() {
        return maxActivePerUnit;
    }

    public int getCancelCutoffHours() {
        return cancelCutoffHours;
    }

    public String getRulesText() {
        return rulesText;
    }
}

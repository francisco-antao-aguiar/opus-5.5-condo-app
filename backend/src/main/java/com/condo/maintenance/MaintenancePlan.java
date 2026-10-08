package com.condo.maintenance;

import com.condo.common.persistence.BaseEntity;
import com.condo.common.persistence.JsonConverters;
import jakarta.persistence.Column;
import jakarta.persistence.Convert;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.hibernate.annotations.OptimisticLock;

/** "Do X on this asset/space on this schedule." Each due occurrence becomes an Issue of kind SCHEDULED. */
@Entity
@Table(name = "maintenance_plan")
public class MaintenancePlan extends BaseEntity {

    public enum PausedReason { MANUAL, ASSET_ARCHIVED }

    @Column(name = "building_id", nullable = false)
    private UUID buildingId;

    @Column(name = "asset_id")
    private UUID assetId;

    @Column(name = "space_id")
    private UUID spaceId;

    @Column(nullable = false, length = 160)
    private String title;

    @Column(length = 2000)
    private String description;

    @Convert(converter = JsonConverters.StringListJson.class)
    @Column(nullable = false, length = 4000)
    private List<String> checklist = List.of();

    @Convert(converter = JsonConverters.RecurrenceJson.class)
    @Column(nullable = false, length = 500)
    private Recurrence recurrence;

    @Column(name = "starts_on", nullable = false)
    private LocalDate startsOn;

    @Column(name = "ends_on")
    private LocalDate endsOn;

    @Column(name = "lead_days", nullable = false)
    private int leadDays = 7;

    @Column(name = "assignee_note", length = 300)
    private String assigneeNote;

    @Column(nullable = false)
    private boolean active = true;

    @Column(name = "paused_reason", length = 32)
    @jakarta.persistence.Enumerated(jakarta.persistence.EnumType.STRING)
    private PausedReason pausedReason;

    /** Next occurrence not generated yet. Advanced by the generator, so excluded from optimistic locking. */
    @OptimisticLock(excluded = true)
    @Column(name = "next_due_on")
    private LocalDate nextDueOn;

    @Column(name = "created_by_user_id", nullable = false)
    private UUID createdByUserId;

    protected MaintenancePlan() {
    }

    public MaintenancePlan(UUID buildingId, UUID createdByUserId) {
        this.buildingId = buildingId;
        this.createdByUserId = createdByUserId;
    }

    /** Full replace of what the plan says. The caller recomputes {@link #nextDueOn}. */
    public void define(UUID assetId, UUID spaceId, String title, String description, List<String> checklist,
            Recurrence recurrence, LocalDate startsOn, LocalDate endsOn, int leadDays, String assigneeNote) {
        this.assetId = assetId;
        this.spaceId = spaceId;
        this.title = title;
        this.description = description;
        this.checklist = checklist == null ? List.of() : List.copyOf(checklist);
        this.recurrence = recurrence;
        this.startsOn = startsOn;
        this.endsOn = endsOn;
        this.leadDays = leadDays;
        this.assigneeNote = assigneeNote;
    }

    /** Next occurrence on or after {@code from}, never before the start. */
    public void scheduleFrom(LocalDate from) {
        nextDueOn = recurrence.nextOnOrAfter(startsOn, endsOn, from);
    }

    /** True when the next occurrence should exist as a task today (due within the lead window). */
    public boolean isDueForGeneration(LocalDate today) {
        return active && nextDueOn != null && !nextDueOn.minusDays(leadDays).isAfter(today);
    }

    /** The occurrence at nextDueOn was generated; move on. */
    public void advance() {
        nextDueOn = recurrence.nextOnOrAfter(startsOn, endsOn, nextDueOn.plusDays(1));
    }

    public void pause(PausedReason reason) {
        active = false;
        pausedReason = reason;
    }

    public void resume(LocalDate today) {
        active = true;
        pausedReason = null;
        scheduleFrom(today);
    }

    public UUID getBuildingId() {
        return buildingId;
    }

    public UUID getAssetId() {
        return assetId;
    }

    public UUID getSpaceId() {
        return spaceId;
    }

    public String getTitle() {
        return title;
    }

    public String getDescription() {
        return description;
    }

    public List<String> getChecklist() {
        return checklist;
    }

    public Recurrence getRecurrence() {
        return recurrence;
    }

    public LocalDate getStartsOn() {
        return startsOn;
    }

    public LocalDate getEndsOn() {
        return endsOn;
    }

    public int getLeadDays() {
        return leadDays;
    }

    public String getAssigneeNote() {
        return assigneeNote;
    }

    public boolean isActive() {
        return active;
    }

    public PausedReason getPausedReason() {
        return pausedReason;
    }

    public LocalDate getNextDueOn() {
        return nextDueOn;
    }

    public UUID getCreatedByUserId() {
        return createdByUserId;
    }
}

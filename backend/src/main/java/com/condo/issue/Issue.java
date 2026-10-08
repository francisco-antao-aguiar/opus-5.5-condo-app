package com.condo.issue;

import com.condo.common.persistence.BaseEntity;
import com.condo.common.persistence.JsonConverters;
import com.condo.space.Visibility;
import jakarta.persistence.Column;
import jakarta.persistence.Convert;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;
import org.hibernate.annotations.OptimisticLock;

/**
 * A reported problem: what (asset + catalog problem, or free "Other" text), where (space, plus a location snapshot),
 * and its lifecycle. Visibility is snapshotted when reported so moving a space later can't expose a private issue.
 */
@Entity
@Table(name = "issue")
public class Issue extends BaseEntity {

    @Column(name = "building_id", nullable = false)
    private UUID buildingId;

    @Column(nullable = false)
    private int number;

    @Column(name = "asset_id")
    private UUID assetId;

    @Column(name = "space_id")
    private UUID spaceId;

    @Column(name = "location_label", nullable = false, length = 400)
    private String locationLabel;

    @Column(name = "problem_type_id")
    private UUID problemTypeId;

    @Column(name = "other_text", length = 200)
    private String otherText;

    @Column(name = "other_text_normalized", length = 200)
    private String otherTextNormalized;

    @Column(length = 1000)
    private String note;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private IssueStatus status = IssueStatus.REPORTED;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private Visibility visibility;

    @Column(name = "shared_with_admins", nullable = false)
    private boolean sharedWithAdmins;

    @Column(name = "reporter_user_id", nullable = false)
    private UUID reporterUserId;

    @Column(name = "merged_into_id")
    private UUID mergedIntoId;

    /** Bumped by "me too"; excluded from optimistic locking so it never makes a status change conflict. */
    @OptimisticLock(excluded = true)
    @Column(name = "affected_count", nullable = false)
    private int affectedCount = 1;

    @Column(name = "client_request_id")
    private UUID clientRequestId;

    @Column(name = "status_changed_at", nullable = false)
    private Instant statusChangedAt;

    @OptimisticLock(excluded = true)
    @Column(name = "last_activity_at", nullable = false)
    private Instant lastActivityAt;

    @Column(name = "resolved_at")
    private Instant resolvedAt;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private IssueKind kind = IssueKind.REPORTED;

    @Column(name = "maintenance_plan_id")
    private UUID maintenancePlanId;

    /** Scheduled tasks: local date (building time zone) it is due. */
    @Column(name = "due_on")
    private LocalDate dueOn;

    @OptimisticLock(excluded = true)
    @Column(name = "overdue_notified_at")
    private Instant overdueNotifiedAt;

    /** Scheduled tasks: the plan's checklist when the task was created. */
    @Convert(converter = JsonConverters.StringListJson.class)
    @Column(name = "checklist", nullable = false, length = 8000)
    private List<String> checklist = List.of();

    /** Ticked items of {@link #checklist}. Ticking bumps the version, so concurrent ticks can't lose each other. */
    @Convert(converter = JsonConverters.ChecklistTicksJson.class)
    @Column(name = "checklist_done", nullable = false, length = 8000)
    private List<ChecklistTick> checklistDone = List.of();

    protected Issue() {
    }

    public Issue(UUID buildingId, int number, UUID assetId, UUID spaceId, String locationLabel, UUID problemTypeId,
            String otherText, String otherTextNormalized, String note, Visibility visibility, boolean sharedWithAdmins,
            UUID reporterUserId, UUID clientRequestId, Instant now) {
        this.buildingId = buildingId;
        this.number = number;
        this.assetId = assetId;
        this.spaceId = spaceId;
        this.locationLabel = locationLabel;
        this.problemTypeId = problemTypeId;
        this.otherText = otherText;
        this.otherTextNormalized = otherTextNormalized;
        this.note = note;
        this.visibility = visibility;
        this.sharedWithAdmins = visibility == Visibility.PRIVATE && sharedWithAdmins;
        this.reporterUserId = reporterUserId;
        this.clientRequestId = clientRequestId;
        this.statusChangedAt = now;
        this.lastActivityAt = now;
        setCreatedAt(now);
    }

    /**
     * A maintenance plan's occurrence. The plan's title is kept in {@code otherText} as the task's title snapshot
     * (without a normalized form, so it never takes part in duplicate detection or the "Other" review).
     */
    public static Issue scheduled(UUID buildingId, int number, UUID assetId, UUID spaceId, String locationLabel,
            String title, Visibility visibility, UUID creatorUserId, UUID planId, LocalDate dueOn,
            List<String> checklist, Instant now) {
        Issue issue = new Issue(buildingId, number, assetId, spaceId, locationLabel, null, title, null, null,
                visibility, false, creatorUserId, null, now);
        issue.kind = IssueKind.SCHEDULED;
        issue.maintenancePlanId = planId;
        issue.dueOn = dueOn;
        issue.checklist = List.copyOf(checklist);
        return issue;
    }

    public boolean isScheduled() {
        return kind == IssueKind.SCHEDULED;
    }

    public boolean isOverdueOn(LocalDate today) {
        return isScheduled() && isOpen() && dueOn != null && dueOn.isBefore(today);
    }

    /** Ticks or unticks one checklist item; returns false when nothing changed. */
    public boolean tick(int index, boolean done, UUID by, Instant now) {
        if (index < 0 || index >= checklist.size()) {
            throw new IndexOutOfBoundsException(index);
        }
        boolean isDone = checklistDone.stream().anyMatch(t -> t.index() == index);
        if (isDone == done) {
            return false;
        }
        List<ChecklistTick> ticks = new ArrayList<>(checklistDone);
        if (done) {
            ticks.add(new ChecklistTick(index, by, now.toString()));
            ticks.sort(Comparator.comparingInt(ChecklistTick::index));
        } else {
            ticks.removeIf(t -> t.index() == index);
        }
        checklistDone = List.copyOf(ticks);
        return true;
    }

    public List<String> getChecklist() {
        return checklist;
    }

    public List<ChecklistTick> getChecklistDone() {
        return checklistDone;
    }

    public void markOverdueNotified(Instant now) {
        overdueNotifiedAt = now;
    }

    public boolean isMerged() {
        return mergedIntoId != null;
    }

    public boolean isOpen() {
        return status.isOpen() && !isMerged();
    }

    public void changeStatus(IssueStatus target, Instant now) {
        if (isMerged() || !status.canMoveTo(target)) {
            throw new IllegalStateException(status + " -> " + target);
        }
        status = target;
        statusChangedAt = now;
        resolvedAt = target == IssueStatus.RESOLVED ? now : null;
        touch(now);
    }

    /** Closes this issue as a duplicate of {@code target}. */
    public void mergeInto(UUID target, Instant now) {
        mergedIntoId = target;
        status = IssueStatus.RESOLVED;
        statusChangedAt = now;
        resolvedAt = now;
        touch(now);
    }

    public void setAffectedCount(int affectedCount) {
        this.affectedCount = affectedCount;
    }

    public void setSharedWithAdmins(boolean shared) {
        this.sharedWithAdmins = visibility == Visibility.PRIVATE && shared;
    }

    /** "Other" text promoted into the catalog: file it under the new problem type, keep the text for history. */
    public void reclassify(UUID problemTypeId) {
        this.problemTypeId = problemTypeId;
    }

    public void touch(Instant now) {
        lastActivityAt = now;
    }

    public UUID getBuildingId() {
        return buildingId;
    }

    public int getNumber() {
        return number;
    }

    public UUID getAssetId() {
        return assetId;
    }

    public UUID getSpaceId() {
        return spaceId;
    }

    public String getLocationLabel() {
        return locationLabel;
    }

    public UUID getProblemTypeId() {
        return problemTypeId;
    }

    public String getOtherText() {
        return otherText;
    }

    public String getOtherTextNormalized() {
        return otherTextNormalized;
    }

    public String getNote() {
        return note;
    }

    public IssueStatus getStatus() {
        return status;
    }

    public Visibility getVisibility() {
        return visibility;
    }

    public boolean isSharedWithAdmins() {
        return sharedWithAdmins;
    }

    public UUID getReporterUserId() {
        return reporterUserId;
    }

    public UUID getMergedIntoId() {
        return mergedIntoId;
    }

    public int getAffectedCount() {
        return affectedCount;
    }

    public UUID getClientRequestId() {
        return clientRequestId;
    }

    public Instant getStatusChangedAt() {
        return statusChangedAt;
    }

    public Instant getLastActivityAt() {
        return lastActivityAt;
    }

    public Instant getResolvedAt() {
        return resolvedAt;
    }

    public IssueKind getKind() {
        return kind;
    }

    public UUID getMaintenancePlanId() {
        return maintenancePlanId;
    }

    public LocalDate getDueOn() {
        return dueOn;
    }

    public Instant getOverdueNotifiedAt() {
        return overdueNotifiedAt;
    }
}

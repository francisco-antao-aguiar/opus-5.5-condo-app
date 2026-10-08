package com.condo.issue.dto;

import com.condo.asset.dto.AssetDtos.ProblemTypeDto;
import com.condo.issue.IssueEventType;
import com.condo.issue.IssueKind;
import com.condo.issue.IssueStatus;
import com.condo.space.Visibility;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;

public final class IssueDtos {

    private IssueDtos() {
    }

    public record IssueSummaryDto(UUID id, UUID buildingId, int number, String title, IssueStatus status,
            Visibility visibility, boolean sharedWithAdmins, UUID assetId, String assetName, String assetType,
            UUID spaceId, String locationLabel, UUID problemTypeId, String otherText, int affectedCount,
            int photoCount, String reportedByName, Instant createdAt, Instant statusChangedAt,
            Instant lastActivityAt, boolean affectedByMe, boolean stuck, UUID mergedIntoId, long version,
            IssueKind kind, UUID maintenancePlanId, LocalDate dueOn, boolean overdue) {
    }

    public record IssueEventDto(UUID id, IssueEventType type, String actorName, IssueStatus fromStatus,
            IssueStatus toStatus, String comment, UUID relatedIssueId, Integer relatedIssueNumber, Instant createdAt) {
    }

    public record IssuePhotoDto(UUID id, String url, Instant urlExpiresAt, String contentType, long sizeBytes,
            String uploadedByName, Instant createdAt, boolean canDelete) {
    }

    public record IssueCapabilities(boolean isReporter, boolean isAffected, boolean canMeToo, boolean canComment,
            List<IssueStatus> allowedTransitions, boolean canMerge, boolean canChangeSharing, boolean canAddPhoto,
            boolean canTickChecklist) {
    }

    /** One item of a scheduled task's checklist. */
    public record ChecklistItemDto(int index, String text, boolean done, String doneByName, Instant doneAt) {
    }

    /** Flattened summary + details (the TS type extends IssueSummaryDto). */
    public record IssueDto(UUID id, UUID buildingId, int number, String title, IssueStatus status,
            Visibility visibility, boolean sharedWithAdmins, UUID assetId, String assetName, String assetType,
            UUID spaceId, String locationLabel, UUID problemTypeId, String otherText, int affectedCount,
            int photoCount, String reportedByName, Instant createdAt, Instant statusChangedAt,
            Instant lastActivityAt, boolean affectedByMe, boolean stuck, UUID mergedIntoId, String note, List<IssueEventDto> timeline, List<IssuePhotoDto> photos,
            IssueCapabilities me, long version, IssueKind kind, UUID maintenancePlanId, LocalDate dueOn,
            boolean overdue, List<ChecklistItemDto> checklist) {
    }

    public record ReportIssueRequest(
            UUID assetId,
            UUID spaceId,
            UUID problemTypeId,
            @Size(max = 200) String otherText,
            @Size(max = 1000) String note,
            Boolean sharedWithAdmins,
            UUID clientRequestId) {
    }

    public record DuplicateIssueInfo(UUID issueId, int number, String title, IssueStatus status, int affectedCount,
            boolean alreadyAffected) {
    }

    public record ChangeIssueStatusRequest(@NotNull IssueStatus status, @Size(max = 1000) String comment,
            Long version) {
    }

    public record CommentRequest(@NotBlank @Size(max = 1000) String text) {
    }

    public record ChecklistTickRequest(@NotNull Boolean done) {
    }

    public record MergeIssueRequest(@NotNull UUID intoIssueId, @Size(max = 1000) String comment) {
    }

    public record SharingRequest(@NotNull Boolean sharedWithAdmins) {
    }

    public record IssueQuery(String view, String status, UUID spaceId, UUID assetId, String sort, Integer page,
            Integer size, IssueKind kind) {
    }

    public record Page<T>(List<T> items, int page, int size, long total) {
    }

    public record AssetHotspot(UUID assetId, String assetName, String locationLabel, int openIssues, int affected) {
    }

    public record IssueDashboard(Map<IssueStatus, Long> counts, long stuckThresholdHours, List<IssueSummaryDto> stuck,
            List<AssetHotspot> hotspots, int otherTextGroups, List<IssueSummaryDto> overdue, int dueThisWeek) {
    }

    public record OtherTextGroup(String assetType, String normalizedText, String sampleText, int count,
            int openCount, Instant lastReportedAt) {
    }

    public record PromoteOtherTextRequest(
            @NotBlank @Size(max = 32) String assetType,
            @NotBlank @Size(max = 200) String normalizedText,
            @NotBlank @Size(max = 120) String label) {
    }

    public record PromoteOtherTextResponse(ProblemTypeDto problemType, int reclassifiedIssues) {
    }
}

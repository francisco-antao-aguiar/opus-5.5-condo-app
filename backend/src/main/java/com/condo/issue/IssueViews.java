package com.condo.issue;

import com.condo.asset.Asset;
import com.condo.asset.AssetRepository;
import com.condo.asset.ProblemType;
import com.condo.asset.ProblemTypeRepository;
import com.condo.auth.User;
import com.condo.auth.UserRepository;
import com.condo.common.config.AppProperties;
import com.condo.common.storage.SignedUrls;
import com.condo.issue.dto.IssueDtos.ChecklistItemDto;
import com.condo.issue.dto.IssueDtos.IssueCapabilities;
import com.condo.issue.dto.IssueDtos.IssueDto;
import com.condo.issue.dto.IssueDtos.IssueEventDto;
import com.condo.issue.dto.IssueDtos.IssuePhotoDto;
import com.condo.issue.dto.IssueDtos.IssueSummaryDto;
import com.condo.space.Space;
import java.time.Clock;
import java.time.Instant;
import java.util.Collection;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

/** Issue → DTO mapping with batch loading of names, so lists cost a handful of queries regardless of size. */
@Component
public class IssueViews {

    private final AssetRepository assets;
    private final ProblemTypeRepository problemTypes;
    private final UserRepository users;
    private final IssuePhotoRepository photos;
    private final IssueEventRepository events;
    private final IssueRepository issues;
    private final IssueAffectedRepository affected;
    private final com.condo.building.BuildingRepository buildings;
    private final SignedUrls signedUrls;
    private final AppProperties props;
    private final Clock clock;

    public IssueViews(AssetRepository assets, ProblemTypeRepository problemTypes, UserRepository users,
            IssuePhotoRepository photos, IssueEventRepository events, IssueRepository issues,
            IssueAffectedRepository affected, com.condo.building.BuildingRepository buildings, SignedUrls signedUrls,
            AppProperties props, Clock clock) {
        this.assets = assets;
        this.problemTypes = problemTypes;
        this.users = users;
        this.photos = photos;
        this.events = events;
        this.issues = issues;
        this.affected = affected;
        this.buildings = buildings;
        this.signedUrls = signedUrls;
        this.props = props;
        this.clock = clock;
    }

    /** @param viewerUserId whose "affected by me" flag to compute */
    public List<IssueSummaryDto> summaries(Collection<Issue> list, UUID viewerUserId) {
        if (list.isEmpty()) {
            return List.of();
        }
        Names names = names(list);
        Map<UUID, Long> photoCounts = photoCounts(list);
        Set<UUID> mine = affected.issuesAffecting(viewerUserId, list.stream().map(Issue::getId).toList());
        return list.stream()
                .map(i -> summary(i, names, photoCounts.getOrDefault(i.getId(), 0L).intValue(), mine.contains(i.getId())))
                .toList();
    }

    public IssueSummaryDto summary(Issue issue, UUID viewerUserId) {
        return summaries(List.of(issue), viewerUserId).getFirst();
    }

    /** @param canTriage whether the viewer triages this issue (may delete any photo) */
    public IssueDto detail(Issue issue, IssueCapabilities me, UUID viewerUserId, boolean canTriage) {
        List<IssueEvent> timeline = events.findByIssueIdOrderByCreatedAtAsc(issue.getId());
        List<IssuePhoto> issuePhotos = photos.findByIssueIdOrderByCreatedAtAsc(issue.getId());

        Set<UUID> userIds = new HashSet<>();
        timeline.forEach(e -> userIds.add(e.getActorUserId()));
        issuePhotos.forEach(p -> userIds.add(p.getUploadedByUserId()));
        issue.getChecklistDone().forEach(t -> userIds.add(t.by()));
        Names names = names(List.of(issue), userIds);
        Map<UUID, Integer> relatedNumbers = issues.findAllById(timeline.stream()
                        .map(IssueEvent::getRelatedIssueId).filter(java.util.Objects::nonNull).toList()).stream()
                .collect(Collectors.toMap(Issue::getId, Issue::getNumber));

        IssueSummaryDto s = summary(issue, names, issuePhotos.size(), me.isAffected());
        List<IssueEventDto> eventDtos = timeline.stream()
                .map(e -> new IssueEventDto(e.getId(), e.getType(), names.user(e.getActorUserId()), e.getFromStatus(),
                        e.getToStatus(), e.getComment(), e.getRelatedIssueId(),
                        e.getRelatedIssueId() != null ? relatedNumbers.get(e.getRelatedIssueId()) : null,
                        e.getCreatedAt()))
                .toList();
        List<IssuePhotoDto> photoDtos = issuePhotos.stream()
                .map(p -> photo(p, names.user(p.getUploadedByUserId()),
                        canTriage || p.getUploadedByUserId().equals(viewerUserId)))
                .toList();
        return new IssueDto(s.id(), s.buildingId(), s.number(), s.title(), s.status(), s.visibility(),
                s.sharedWithAdmins(), s.assetId(), s.assetName(), s.assetType(), s.spaceId(), s.locationLabel(),
                s.problemTypeId(), s.otherText(), s.affectedCount(), s.photoCount(), s.reportedByName(), s.createdAt(),
                s.statusChangedAt(), s.lastActivityAt(), s.affectedByMe(), s.stuck(), s.mergedIntoId(),
                issue.getNote(), eventDtos, photoDtos, me, s.version(), s.kind(), s.maintenancePlanId(), s.dueOn(),
                s.overdue(), checklist(issue, names));
    }

    private static List<ChecklistItemDto> checklist(Issue issue, Names names) {
        Map<Integer, ChecklistTick> ticks = issue.getChecklistDone().stream()
                .collect(Collectors.toMap(ChecklistTick::index, t -> t, (a, b) -> a));
        List<String> items = issue.getChecklist();
        return java.util.stream.IntStream.range(0, items.size())
                .mapToObj(i -> {
                    ChecklistTick t = ticks.get(i);
                    return new ChecklistItemDto(i, items.get(i), t != null, t != null ? names.user(t.by()) : null,
                            t != null ? t.atInstant() : null);
                })
                .toList();
    }

    public IssuePhotoDto photo(IssuePhoto p, String uploaderName, boolean canDelete) {
        SignedUrls.Signature sig = signedUrls.sign(p.getId().toString());
        String url = ServletUriComponentsBuilder.fromCurrentContextPath()
                .path("/api/files/photos/{id}")
                .queryParam("exp", sig.expiresAtEpochSeconds())
                .queryParam("sig", sig.sig())
                .buildAndExpand(p.getId())
                .toUriString();
        return new IssuePhotoDto(p.getId(), url, sig.expiresAt(), p.getContentType(), p.getSizeBytes(), uploaderName,
                p.getCreatedAt(), canDelete);
    }

    /** Problem label, or the "Other" text. */
    public String title(Issue issue, Map<UUID, ProblemType> problemTypesById) {
        ProblemType p = issue.getProblemTypeId() != null ? problemTypesById.get(issue.getProblemTypeId()) : null;
        if (p != null) {
            return p.getLabel();
        }
        return issue.getOtherText() != null ? issue.getOtherText() : "Problem";
    }

    /** Residents' reports only; scheduled tasks have due dates and become "overdue" instead. */
    public boolean isStuck(Issue issue, Instant now) {
        return !issue.isScheduled() && issue.getStatus() == IssueStatus.REPORTED && !issue.isMerged()
                && issue.getStatusChangedAt().plus(props.issues().stuckAfter()).isBefore(now);
    }

    // ---------- internals ----------

    private IssueSummaryDto summary(Issue i, Names names, int photoCount, boolean affectedByMe) {
        Asset asset = i.getAssetId() != null ? names.assets.get(i.getAssetId()) : null;
        return new IssueSummaryDto(i.getId(), i.getBuildingId(), i.getNumber(), title(i, names.problemTypes),
                i.getStatus(), i.getVisibility(), i.isSharedWithAdmins(), i.getAssetId(),
                asset != null ? asset.getName() : null, asset != null ? asset.getAssetTypeCode() : null,
                i.getSpaceId(), i.getLocationLabel(), i.getProblemTypeId(), i.getOtherText(), i.getAffectedCount(),
                photoCount, names.user(i.getReporterUserId()), i.getCreatedAt(), i.getStatusChangedAt(),
                i.getLastActivityAt(), affectedByMe, isStuck(i, clock.instant()), i.getMergedIntoId(),
                i.getVersion() != null ? i.getVersion() : 0L, i.getKind(), i.getMaintenancePlanId(), i.getDueOn(),
                i.isOverdueOn(names.today(i.getBuildingId())));
    }

    private Map<UUID, Long> photoCounts(Collection<Issue> list) {
        if (list.isEmpty()) {
            return Map.of();
        }
        Map<UUID, Long> counts = new HashMap<>();
        for (Object[] row : photos.countByIssueIds(list.stream().map(Issue::getId).toList())) {
            counts.put((UUID) row[0], (Long) row[1]);
        }
        return counts;
    }

    private Names names(Collection<Issue> list) {
        return names(list, Set.of());
    }

    private Names names(Collection<Issue> list, Set<UUID> extraUserIds) {
        Set<UUID> userIds = new HashSet<>(extraUserIds);
        Set<UUID> assetIds = new HashSet<>();
        Set<UUID> problemIds = new HashSet<>();
        for (Issue i : list) {
            userIds.add(i.getReporterUserId());
            if (i.getAssetId() != null) {
                assetIds.add(i.getAssetId());
            }
            if (i.getProblemTypeId() != null) {
                problemIds.add(i.getProblemTypeId());
            }
        }
        Map<UUID, java.time.LocalDate> today = new HashMap<>();
        list.stream().map(Issue::getBuildingId).distinct().forEach(b -> today.put(b, today(b)));
        return new Names(
                users.findAllById(userIds).stream().collect(Collectors.toMap(User::getId, User::getDisplayName)),
                assets.findAllById(assetIds).stream().collect(Collectors.toMap(Asset::getId, Function.identity())),
                problemTypes.findAllById(problemIds).stream()
                        .collect(Collectors.toMap(ProblemType::getId, Function.identity())),
                today);
    }

    private record Names(Map<UUID, String> users, Map<UUID, Asset> assets, Map<UUID, ProblemType> problemTypes,
            Map<UUID, java.time.LocalDate> todayByBuilding) {

        String user(UUID id) {
            return users.getOrDefault(id, "Former member");
        }

        java.time.LocalDate today(UUID buildingId) {
            return todayByBuilding.get(buildingId);
        }
    }

    /** Today's local date in the building's time zone (due dates and "overdue" are local). */
    public java.time.LocalDate today(UUID buildingId) {
        return buildings.findById(buildingId)
                .map(b -> java.time.LocalDate.now(clock.withZone(b.zone())))
                .orElse(java.time.LocalDate.now(clock));
    }

    /** For callers mapping spaces; kept here so all issue presentation lives in one place. */
    public static Map<UUID, Space> index(Collection<Space> spaces) {
        return spaces.stream().collect(Collectors.toMap(Space::getId, Function.identity()));
    }
}

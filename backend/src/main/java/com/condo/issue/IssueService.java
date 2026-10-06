package com.condo.issue;

import com.condo.asset.Asset;
import com.condo.asset.AssetRepository;
import com.condo.asset.CatalogService;
import com.condo.asset.ProblemType;
import com.condo.asset.ProblemTypeRepository;
import com.condo.building.Building;
import com.condo.building.BuildingRepository;
import com.condo.common.error.ApiException;
import com.condo.common.error.ErrorCodes;
import com.condo.common.persistence.Versions;
import com.condo.governance.AccessGuard;
import com.condo.governance.Action;
import com.condo.governance.PermissionService;
import com.condo.governance.SpacePrivacy;
import com.condo.issue.dto.IssueDtos.ChangeIssueStatusRequest;
import com.condo.issue.dto.IssueDtos.CommentRequest;
import com.condo.issue.dto.IssueDtos.DuplicateIssueInfo;
import com.condo.issue.dto.IssueDtos.IssueCapabilities;
import com.condo.issue.dto.IssueDtos.IssueDto;
import com.condo.issue.dto.IssueDtos.IssueQuery;
import com.condo.issue.dto.IssueDtos.IssueSummaryDto;
import com.condo.issue.dto.IssueDtos.MergeIssueRequest;
import com.condo.issue.dto.IssueDtos.Page;
import com.condo.issue.dto.IssueDtos.ReportIssueRequest;
import com.condo.issue.dto.IssueDtos.SharingRequest;
import com.condo.member.Membership;
import com.condo.space.Space;
import com.condo.space.SpaceRepository;
import com.condo.space.SpaceService;
import com.condo.space.Visibility;
import java.time.Clock;
import java.time.Instant;
import java.util.Arrays;
import java.util.Comparator;
import java.util.EnumSet;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Reporting, "me too", lifecycle, comments, merge and sharing of issues. */
@Service
@Transactional
public class IssueService {

    static final int MAX_PHOTOS = 5;

    private final IssueRepository issues;
    private final IssueAffectedRepository affected;
    private final IssueEventRepository events;
    private final IssuePhotoRepository photos;
    private final AssetRepository assets;
    private final ProblemTypeRepository problemTypes;
    private final SpaceRepository spaces;
    private final BuildingRepository buildings;
    private final CatalogService catalog;
    private final AccessGuard guard;
    private final PermissionService permissions;
    private final SpacePrivacy privacy;
    private final IssueAccess access;
    private final IssueViews views;
    private final ApplicationEventPublisher publisher;
    private final Clock clock;

    public IssueService(IssueRepository issues, IssueAffectedRepository affected, IssueEventRepository events,
            IssuePhotoRepository photos, AssetRepository assets, ProblemTypeRepository problemTypes,
            SpaceRepository spaces, BuildingRepository buildings, CatalogService catalog, AccessGuard guard,
            PermissionService permissions, SpacePrivacy privacy, IssueAccess access, IssueViews views,
            ApplicationEventPublisher publisher, Clock clock) {
        this.issues = issues;
        this.affected = affected;
        this.events = events;
        this.photos = photos;
        this.assets = assets;
        this.problemTypes = problemTypes;
        this.spaces = spaces;
        this.buildings = buildings;
        this.catalog = catalog;
        this.guard = guard;
        this.permissions = permissions;
        this.privacy = privacy;
        this.access = access;
        this.views = views;
        this.publisher = publisher;
        this.clock = clock;
    }

    // ===================== reporting =====================

    public IssueDto report(UUID buildingId, ReportIssueRequest req) {
        Membership member = guard.requireActiveMember(buildingId);
        UUID userId = member.getUser().getId();

        // Idempotent retries (offline queue): the same request id returns the issue created the first time.
        if (req.clientRequestId() != null) {
            Issue existing = issues.findByReporterUserIdAndClientRequestId(userId, req.clientRequestId()).orElse(null);
            if (existing != null) {
                if (!existing.getBuildingId().equals(buildingId)) {
                    throw ApiException.conflict(ErrorCodes.CONFLICT, "This request id was already used.");
                }
                return detail(load(buildingId, existing.getId()));
            }
        }

        Map<UUID, Space> spacesById = IssueViews.index(spaces.findByBuildingIdOrderByDepthAscSortOrderAscNameAsc(buildingId));
        Asset asset = null;
        Space space;
        if (req.assetId() != null) {
            asset = assets.findByIdAndBuildingId(req.assetId(), buildingId)
                    .orElseThrow(() -> ApiException.notFound("Asset"));
            if (asset.isArchived()) {
                throw ApiException.conflict(ErrorCodes.ASSET_ARCHIVED, "This item is archived.");
            }
            space = spacesById.get(asset.getSpaceId());
        } else if (req.spaceId() != null) {
            space = spacesById.get(req.spaceId());
            if (space == null) {
                throw ApiException.notFound("Space");
            }
        } else {
            throw ApiException.invalidField("assetId", "Pick an item or a place");
        }
        guard.require(buildingId, Action.ISSUE_REPORT, space);
        Visibility visibility = SpaceService.effectiveVisibility(space, spacesById);
        if (!privacy.canSee(member, space, visibility)) {
            throw ApiException.notFound(asset != null ? "Asset" : "Space");
        }

        // What's wrong: exactly one of a catalog problem or a free text.
        String otherText = blankToNull(req.otherText());
        if (req.problemTypeId() != null && otherText != null) {
            throw ApiException.invalidField("otherText", "Choose a listed problem or describe it, not both");
        }
        if (req.problemTypeId() == null && otherText == null) {
            throw ApiException.invalidField(asset != null ? "problemTypeId" : "otherText",
                    asset != null ? "Pick a problem or describe it" : "Describe the problem");
        }
        UUID problemTypeId = null;
        if (req.problemTypeId() != null) {
            ProblemType p = problemTypes.findById(req.problemTypeId()).orElse(null);
            if (asset == null || p == null || !catalog.isOffered(buildingId, asset.getAssetTypeCode(), p)) {
                throw ApiException.badRequest(ErrorCodes.INVALID_PROBLEM_TYPE,
                        "That problem isn't offered for this item.");
            }
            problemTypeId = p.getId();
        }
        String normalized = OtherTexts.normalize(otherText);

        if (asset != null) {
            rejectDuplicate(member, asset.getId(), problemTypeId, normalized, spacesById);
        }

        Instant now = clock.instant();
        Building building = buildings.findByIdForUpdate(buildingId).orElseThrow();
        Issue issue = issues.save(new Issue(buildingId, building.nextIssueNumber(),
                asset != null ? asset.getId() : null, space.getId(), SpaceService.pathLabel(space, spacesById),
                problemTypeId, otherText, normalized, blankToNull(req.note()), visibility,
                Boolean.TRUE.equals(req.sharedWithAdmins()), userId, req.clientRequestId(), now));
        affected.save(new IssueAffected(issue.getId(), userId, IssueAffected.Kind.REPORTER, now));
        record(issue, IssueEvent.of(issue, userId, IssueEventType.REPORTED, null, now));
        return detail(new Loaded(member, issue, space));
    }

    /** Open issue on the same asset with the same problem (or same normalized "Other" text) → 409 with it. */
    private void rejectDuplicate(Membership member, UUID assetId, UUID problemTypeId, String normalized,
            Map<UUID, Space> spacesById) {
        for (Issue open : issues.findOpenOnAsset(assetId)) {
            boolean same = problemTypeId != null ? problemTypeId.equals(open.getProblemTypeId())
                    : normalized != null && normalized.equals(open.getOtherTextNormalized());
            if (same && access.canSee(member, open, spacesById.get(open.getSpaceId()))) {
                boolean already = affected.existsById(new IssueAffected.Key(open.getId(), member.getUser().getId()));
                IssueSummaryDto s = views.summary(open, member.getUser().getId());
                throw ApiException.conflict(ErrorCodes.DUPLICATE_ISSUE,
                        "Already reported — " + s.affectedCount() + " affected.")
                        .with("duplicate", new DuplicateIssueInfo(s.id(), s.number(), s.title(), s.status(),
                                s.affectedCount(), already));
            }
        }
    }

    // ===================== reading =====================

    /** Viewing an issue also marks the viewer's notifications about it as read (see IssueViewed). */
    public IssueDto get(UUID buildingId, UUID issueId) {
        Loaded l = load(buildingId, issueId);
        publisher.publishEvent(new IssueViewed(issueId, userId(l)));
        return detail(l);
    }

    /** Open issues on an asset, for "already reported?" before the user picks a problem. */
    @Transactional(readOnly = true)
    public List<IssueSummaryDto> openOnAsset(UUID buildingId, UUID assetId) {
        Membership member = guard.require(buildingId, Action.BUILDING_VIEW);
        Asset asset = assets.findByIdAndBuildingId(assetId, buildingId).orElseThrow(() -> ApiException.notFound("Asset"));
        Map<UUID, Space> spacesById = IssueViews.index(spaces.findByBuildingIdOrderByDepthAscSortOrderAscNameAsc(buildingId));
        Space space = spacesById.get(asset.getSpaceId());
        if (space == null || !privacy.canSee(member, space, SpaceService.effectiveVisibility(space, spacesById))) {
            throw ApiException.notFound("Asset");
        }
        return views.summaries(issues.findOpenOnAsset(assetId).stream()
                .filter(i -> access.canSee(member, i, spacesById.get(i.getSpaceId())))
                .toList(), member.getUser().getId());
    }

    /**
     * Views: shared (COMMON), mine (reported/me-too), unit (PRIVATE in my unit), triage (what I may triage).
     * Filters in memory after one indexed query; fine for a building's few thousand issues.
     */
    @Transactional(readOnly = true)
    public Page<IssueSummaryDto> list(UUID buildingId, IssueQuery q) {
        Membership member = guard.require(buildingId, Action.BUILDING_VIEW);
        String view = q.view() == null ? "shared" : q.view().toLowerCase(Locale.ROOT);
        if (!Set.of("shared", "mine", "unit", "triage").contains(view)) {
            throw ApiException.invalidField("view", "must be shared, mine, unit or triage");
        }
        Map<UUID, Space> spacesById = IssueViews.index(spaces.findByBuildingIdOrderByDepthAscSortOrderAscNameAsc(buildingId));
        String subtree = null;
        if (q.spaceId() != null) {
            Space root = spacesById.get(q.spaceId());
            if (root == null) {
                throw ApiException.notFound("Space");
            }
            subtree = root.getPath();
        }

        List<Issue> candidates = issues.findListable(buildingId, parseStatuses(q.status()));
        Set<UUID> mine = view.equals("mine")
                ? affected.issuesAffecting(member.getUser().getId(), candidates.stream().map(Issue::getId).toList())
                : Set.of();
        String prefix = subtree;
        List<Issue> matching = candidates.stream()
                .filter(i -> q.assetId() == null || q.assetId().equals(i.getAssetId()))
                .filter(i -> q.kind() == null || q.kind() == i.getKind())
                .filter(i -> {
                    if (prefix == null) {
                        return true;
                    }
                    Space s = spacesById.get(i.getSpaceId());
                    return s != null && s.getPath().startsWith(prefix);
                })
                .filter(i -> {
                    Space s = spacesById.get(i.getSpaceId());
                    if (!access.canSee(member, i, s)) {
                        return false;
                    }
                    return switch (view) {
                        case "mine" -> mine.contains(i.getId());
                        case "unit" -> i.getVisibility() == Visibility.PRIVATE && access.isUnitMember(member, s);
                        case "triage" -> access.canTriage(member, i, s);
                        default -> i.getVisibility() == Visibility.COMMON;
                    };
                })
                .sorted("recent".equalsIgnoreCase(q.sort())
                        ? Comparator.comparing(Issue::getLastActivityAt).reversed()
                        : Comparator.comparingInt(Issue::getAffectedCount).reversed()
                                .thenComparing(Issue::getCreatedAt))
                .toList();

        int size = q.size() != null ? q.size() : 25;
        int page = q.page() != null ? q.page() : 0;
        List<Issue> slice = matching.stream().skip((long) page * size).limit(size).toList();
        return new Page<>(views.summaries(slice, member.getUser().getId()), page, size, matching.size());
    }

    // ===================== lifecycle =====================

    public IssueDto changeStatus(UUID buildingId, UUID issueId, ChangeIssueStatusRequest req) {
        Loaded l = load(buildingId, issueId);
        Issue issue = l.issue();
        requireNotMerged(issue);
        Versions.requireCurrent(req.version(), issue);
        IssueStatus from = issue.getStatus();
        if (!from.canMoveTo(req.status())) {
            throw ApiException.conflict(ErrorCodes.INVALID_TRANSITION,
                    "An issue can't go from " + label(from) + " to " + label(req.status()) + ".");
        }
        if (!access.allowedTransitions(l.member(), issue, l.space(), isAffected(l)).contains(req.status())) {
            throw ApiException.forbidden(ErrorCodes.PERMISSION_DENIED, "You can't change this issue's status.");
        }
        Instant now = clock.instant();
        issue.changeStatus(req.status(), now);
        record(issue, IssueEvent.statusChange(issue, userId(l), from, req.status(), blankToNull(req.comment()), now));
        issues.flush();
        return detail(l);
    }

    public IssueDto comment(UUID buildingId, UUID issueId, CommentRequest req) {
        Loaded l = load(buildingId, issueId);
        requireNotMerged(l.issue());
        Instant now = clock.instant();
        l.issue().touch(now);
        record(l.issue(), IssueEvent.of(l.issue(), userId(l), IssueEventType.COMMENT, req.text().trim(), now));
        return detail(l);
    }

    public IssueDto meToo(UUID buildingId, UUID issueId) {
        Loaded l = load(buildingId, issueId);
        Issue issue = l.issue();
        requireNotMerged(issue);
        if (!issue.isOpen()) {
            throw ApiException.conflict(ErrorCodes.INVALID_TRANSITION, "This issue is resolved — reopen it instead.");
        }
        if (issue.isScheduled()) {
            throw ApiException.conflict(ErrorCodes.INVALID_STATE, "Scheduled maintenance can't be \"me too\"-ed.");
        }
        guard.require(buildingId, Action.ISSUE_REPORT, l.space());
        if (!isAffected(l)) {
            Instant now = clock.instant();
            affected.saveAndFlush(new IssueAffected(issue.getId(), userId(l), IssueAffected.Kind.ME_TOO, now));
            issue.setAffectedCount((int) affected.countByIdIssueId(issue.getId()));
            issue.touch(now);
            record(issue, IssueEvent.of(issue, userId(l), IssueEventType.ME_TOO, null, now));
        }
        return detail(l);
    }

    public IssueDto withdrawMeToo(UUID buildingId, UUID issueId) {
        Loaded l = load(buildingId, issueId);
        Issue issue = l.issue();
        requireNotMerged(issue);
        if (access.isReporter(l.member(), issue)) {
            throw ApiException.conflict(ErrorCodes.CONFLICT, "You reported this issue; resolve it instead.");
        }
        IssueAffected.Key key = new IssueAffected.Key(issue.getId(), userId(l));
        if (affected.existsById(key)) {
            Instant now = clock.instant();
            affected.deleteById(key);
            affected.flush();
            issue.setAffectedCount((int) affected.countByIdIssueId(issue.getId()));
            issue.touch(now);
            record(issue, IssueEvent.of(issue, userId(l), IssueEventType.ME_TOO_WITHDRAWN, null, now));
        }
        return detail(l);
    }

    /** Closes {@code issueId} into another open issue, moving its affected people over. Returns the survivor. */
    public IssueDto merge(UUID buildingId, UUID issueId, MergeIssueRequest req) {
        Loaded source = load(buildingId, issueId);
        if (issueId.equals(req.intoIssueId())) {
            throw ApiException.badRequest(ErrorCodes.INVALID_MERGE, "An issue can't be merged into itself.");
        }
        Loaded target = load(buildingId, req.intoIssueId());
        requireNotMerged(source.issue());
        requireNotMerged(target.issue());
        if (!target.issue().isOpen()) {
            throw ApiException.conflict(ErrorCodes.INVALID_MERGE, "Merge into an open issue, or reopen it first.");
        }
        if (!access.canTriage(source.member(), source.issue(), source.space())
                || !access.canTriage(target.member(), target.issue(), target.space())) {
            throw ApiException.forbidden(ErrorCodes.PERMISSION_DENIED, "Only people who triage both issues can merge them.");
        }
        Instant now = clock.instant();
        UUID actor = userId(source);
        Set<UUID> already = affected.findByIdIssueId(target.issue().getId()).stream()
                .map(IssueAffected::getUserId).collect(Collectors.toSet());
        for (IssueAffected a : affected.findByIdIssueId(source.issue().getId())) {
            if (!already.contains(a.getUserId())) {
                affected.save(new IssueAffected(target.issue().getId(), a.getUserId(), IssueAffected.Kind.ME_TOO, now));
            }
        }
        affected.flush();
        target.issue().setAffectedCount((int) affected.countByIdIssueId(target.issue().getId()));
        target.issue().touch(now);
        source.issue().mergeInto(target.issue().getId(), now);
        String comment = blankToNull(req.comment());
        record(source.issue(), IssueEvent.related(source.issue(), actor, IssueEventType.MERGED_INTO,
                target.issue().getId(), comment, now));
        record(target.issue(), IssueEvent.related(target.issue(), actor, IssueEventType.MERGED_FROM,
                source.issue().getId(), comment, now));
        issues.flush();
        return detail(target);
    }

    public IssueDto setSharing(UUID buildingId, UUID issueId, SharingRequest req) {
        Loaded l = load(buildingId, issueId);
        Issue issue = l.issue();
        requireNotMerged(issue);
        if (issue.getVisibility() != Visibility.PRIVATE) {
            throw ApiException.conflict(ErrorCodes.CONFLICT, "Only private issues have a sharing choice.");
        }
        if (!access.isReporter(l.member(), issue) && !access.isUnitMember(l.member(), l.space())) {
            throw ApiException.forbidden(ErrorCodes.PERMISSION_DENIED, "Only the unit's members decide this.");
        }
        if (issue.isSharedWithAdmins() != req.sharedWithAdmins()) {
            Instant now = clock.instant();
            issue.setSharedWithAdmins(req.sharedWithAdmins());
            issue.touch(now);
            record(issue, IssueEvent.of(issue, userId(l), IssueEventType.SHARING_CHANGED,
                    req.sharedWithAdmins() ? "Shared with building management" : "No longer shared with management",
                    now));
            issues.flush();
        }
        return detail(l);
    }

    // ===================== shared with photo & insights services =====================

    /** Member + visible issue + its space (null if deleted); 404 when the caller can't see it. */
    Loaded load(UUID buildingId, UUID issueId) {
        Membership member = guard.require(buildingId, Action.BUILDING_VIEW);
        Issue issue = issues.findByIdAndBuildingId(issueId, buildingId)
                .orElseThrow(() -> ApiException.notFound("Issue"));
        Space space = issue.getSpaceId() != null ? spaces.findById(issue.getSpaceId()).orElse(null) : null;
        if (!access.canSee(member, issue, space)) {
            throw ApiException.notFound("Issue");
        }
        return new Loaded(member, issue, space);
    }

    IssueDto detail(Loaded l) {
        return views.detail(l.issue(), capabilities(l), userId(l), canTriage(l));
    }

    boolean canAddPhoto(Loaded l) {
        return !l.issue().isMerged()
                && (access.isReporter(l.member(), l.issue()) || isAffected(l)
                        || access.canTriage(l.member(), l.issue(), l.space()))
                && photos.countByIssueId(l.issue().getId()) < MAX_PHOTOS;
    }

    boolean canTriage(Loaded l) {
        return access.canTriage(l.member(), l.issue(), l.space());
    }

    /** Appends to the timeline and announces it (delivered after commit in phase 5). */
    void record(Issue issue, IssueEvent event) {
        events.save(event);
        Set<UUID> audience = affected.findByIdIssueId(issue.getId()).stream()
                .map(IssueAffected::getUserId)
                .filter(u -> !u.equals(event.getActorUserId()))
                .collect(Collectors.toCollection(HashSet::new));
        publisher.publishEvent(new IssueActivity(issue.getBuildingId(), issue.getId(), issue.getNumber(),
                event.getId(), event.getType(), issue.getStatus(), event.getActorUserId(), audience));
    }

    record Loaded(Membership member, Issue issue, Space space) {
    }

    // ===================== helpers =====================

    private IssueCapabilities capabilities(Loaded l) {
        Issue issue = l.issue();
        Membership m = l.member();
        boolean reporter = access.isReporter(m, issue);
        boolean isAffected = isAffected(l);
        boolean merged = issue.isMerged();
        boolean canMeToo = issue.isOpen() && !issue.isScheduled() && !isAffected
                && permissions.can(m, Action.ISSUE_REPORT, l.space());
        boolean canMerge = issue.isOpen() && access.canTriage(m, issue, l.space());
        boolean canShare = !merged && issue.getVisibility() == Visibility.PRIVATE
                && (reporter || access.isUnitMember(m, l.space()));
        return new IssueCapabilities(reporter, isAffected, canMeToo, !merged,
                access.allowedTransitions(m, issue, l.space(), isAffected), canMerge, canShare, canAddPhoto(l));
    }

    private boolean isAffected(Loaded l) {
        return affected.existsById(new IssueAffected.Key(l.issue().getId(), userId(l)));
    }

    private static UUID userId(Loaded l) {
        return l.member().getUser().getId();
    }

    private static void requireNotMerged(Issue issue) {
        if (issue.isMerged()) {
            throw ApiException.conflict(ErrorCodes.ISSUE_MERGED, "This issue was merged into another one.")
                    .with("mergedIntoId", issue.getMergedIntoId());
        }
    }

    private static Set<IssueStatus> parseStatuses(String status) {
        if (status == null || status.isBlank() || status.equalsIgnoreCase("open")) {
            return EnumSet.of(IssueStatus.REPORTED, IssueStatus.ACKNOWLEDGED, IssueStatus.IN_PROGRESS);
        }
        if (status.equalsIgnoreCase("all")) {
            return EnumSet.allOf(IssueStatus.class);
        }
        try {
            return Arrays.stream(status.split(","))
                    .map(s -> IssueStatus.valueOf(s.trim().toUpperCase(Locale.ROOT)))
                    .collect(Collectors.toCollection(() -> EnumSet.noneOf(IssueStatus.class)));
        } catch (IllegalArgumentException e) {
            throw ApiException.invalidField("status", "use open, all or a list of statuses");
        }
    }

    private static String label(IssueStatus s) {
        return s.name().toLowerCase(Locale.ROOT).replace('_', ' ');
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}

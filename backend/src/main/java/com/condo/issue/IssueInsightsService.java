package com.condo.issue;

import com.condo.asset.Asset;
import com.condo.asset.AssetRepository;
import com.condo.asset.CatalogService;
import com.condo.asset.dto.AssetDtos.CreateProblemTypeRequest;
import com.condo.asset.dto.AssetDtos.ProblemTypeDto;
import com.condo.common.config.AppProperties;
import com.condo.governance.AccessGuard;
import com.condo.governance.Action;
import com.condo.issue.dto.IssueDtos.AssetHotspot;
import com.condo.issue.dto.IssueDtos.IssueDashboard;
import com.condo.issue.dto.IssueDtos.OtherTextGroup;
import com.condo.issue.dto.IssueDtos.PromoteOtherTextRequest;
import com.condo.issue.dto.IssueDtos.PromoteOtherTextResponse;
import com.condo.member.Membership;
import com.condo.space.Space;
import com.condo.space.SpaceRepository;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumMap;
import java.util.EnumSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Triage dashboard, and turning frequent "Other" texts into catalog entries. */
@Service
@Transactional
public class IssueInsightsService {

    private static final int STUCK_LIMIT = 20;
    private static final int HOTSPOT_LIMIT = 5;

    private final IssueRepository issues;
    private final AssetRepository assets;
    private final SpaceRepository spaces;
    private final CatalogService catalog;
    private final IssueService issueService;
    private final IssueAccess access;
    private final IssueViews views;
    private final AccessGuard guard;
    private final AppProperties props;
    private final Clock clock;

    public IssueInsightsService(IssueRepository issues, AssetRepository assets, SpaceRepository spaces,
            CatalogService catalog, IssueService issueService, IssueAccess access, IssueViews views,
            AccessGuard guard, AppProperties props, Clock clock) {
        this.issues = issues;
        this.assets = assets;
        this.spaces = spaces;
        this.catalog = catalog;
        this.issueService = issueService;
        this.access = access;
        this.views = views;
        this.guard = guard;
        this.props = props;
        this.clock = clock;
    }

    /** Everything is computed over the issues this member may triage. */
    @Transactional(readOnly = true)
    public IssueDashboard dashboard(UUID buildingId) {
        Membership member = guard.require(buildingId, Action.ISSUE_TRIAGE);
        Map<UUID, Space> spacesById = spacesOf(buildingId);
        Instant now = clock.instant();
        List<Issue> triageable = issues.findListable(buildingId, EnumSet.allOf(IssueStatus.class)).stream()
                .filter(i -> access.canTriage(member, i, spacesById.get(i.getSpaceId())))
                .toList();

        Map<IssueStatus, Long> counts = new EnumMap<>(IssueStatus.class);
        for (IssueStatus s : IssueStatus.values()) {
            counts.put(s, 0L);
        }
        triageable.forEach(i -> counts.merge(i.getStatus(), 1L, Long::sum));

        List<Issue> stuck = triageable.stream()
                .filter(i -> views.isStuck(i, now))
                .sorted(Comparator.comparing(Issue::getStatusChangedAt))
                .limit(STUCK_LIMIT)
                .toList();

        Map<UUID, List<Issue>> openByAsset = triageable.stream()
                .filter(i -> i.isOpen() && i.getAssetId() != null)
                .collect(Collectors.groupingBy(Issue::getAssetId));
        Map<UUID, Asset> assetsById = assets.findAllById(openByAsset.keySet()).stream()
                .collect(Collectors.toMap(Asset::getId, Function.identity()));
        List<AssetHotspot> hotspots = openByAsset.entrySet().stream()
                .map(e -> new AssetHotspot(e.getKey(),
                        assetsById.containsKey(e.getKey()) ? assetsById.get(e.getKey()).getName() : "Item",
                        e.getValue().getFirst().getLocationLabel(), e.getValue().size(),
                        e.getValue().stream().mapToInt(Issue::getAffectedCount).sum()))
                .sorted(Comparator.comparingInt(AssetHotspot::openIssues).reversed()
                        .thenComparing(Comparator.comparingInt(AssetHotspot::affected).reversed()))
                .limit(HOTSPOT_LIMIT)
                .toList();

        int otherGroups = (int) groupOtherTexts(member, buildingId, spacesById).stream()
                .filter(g -> g.count() >= 2).count();

        java.time.LocalDate today = views.today(buildingId);
        List<Issue> overdue = triageable.stream()
                .filter(i -> i.isOverdueOn(today))
                .sorted(Comparator.comparing(Issue::getDueOn))
                .limit(STUCK_LIMIT)
                .toList();
        int dueThisWeek = (int) triageable.stream()
                .filter(i -> i.isScheduled() && i.isOpen() && i.getDueOn() != null
                        && !i.getDueOn().isBefore(today) && !i.getDueOn().isAfter(today.plusDays(7)))
                .count();
        return new IssueDashboard(counts, props.issues().stuckAfter().toHours(),
                views.summaries(stuck, member.getUser().getId()), hotspots, otherGroups,
                views.summaries(overdue, member.getUser().getId()), dueThisWeek);
    }

    /** Free "Other" texts not yet filed under a catalog entry, grouped by asset type and normalized text. */
    @Transactional(readOnly = true)
    public List<OtherTextGroup> otherTexts(UUID buildingId) {
        Membership member = guard.require(buildingId, Action.CATALOG_EDIT);
        return groupOtherTexts(member, buildingId, spacesOf(buildingId));
    }

    /** Adds the text to the building's catalog and re-files the matching issues under it. */
    public PromoteOtherTextResponse promote(UUID buildingId, PromoteOtherTextRequest req) {
        Membership member = guard.require(buildingId, Action.CATALOG_EDIT);
        ProblemTypeDto created = catalog.create(buildingId,
                new CreateProblemTypeRequest(req.assetType(), req.label(), null));
        String normalized = OtherTexts.normalize(req.normalizedText());
        Map<UUID, String> assetTypes = assetTypesOf(buildingId);
        Instant now = clock.instant();
        int count = 0;
        for (Issue i : issues.findUnclassifiedOtherTexts(buildingId)) {
            if (normalized != null && normalized.equals(i.getOtherTextNormalized())
                    && req.assetType().equals(assetTypes.get(i.getAssetId()))) {
                i.reclassify(created.id());
                issueService.record(i, IssueEvent.of(i, member.getUser().getId(), IssueEventType.RECLASSIFIED,
                        "Filed under \"" + created.label() + "\"", now));
                count++;
            }
        }
        return new PromoteOtherTextResponse(created, count);
    }

    private List<OtherTextGroup> groupOtherTexts(Membership member, UUID buildingId, Map<UUID, Space> spacesById) {
        Map<UUID, String> assetTypes = assetTypesOf(buildingId);
        Map<String, List<Issue>> groups = new LinkedHashMap<>();
        for (Issue i : issues.findUnclassifiedOtherTexts(buildingId)) {
            String type = assetTypes.get(i.getAssetId());
            // Private texts stay private: only count what this member could read anyway.
            if (type != null && access.canSee(member, i, spacesById.get(i.getSpaceId()))) {
                groups.computeIfAbsent(type + "\u0000" + i.getOtherTextNormalized(), k -> new ArrayList<>()).add(i);
            }
        }
        return groups.values().stream()
                .map(list -> {
                    Issue first = list.getFirst();
                    String sample = list.stream()
                            .collect(Collectors.groupingBy(Issue::getOtherText, Collectors.counting()))
                            .entrySet().stream().max(Map.Entry.comparingByValue()).orElseThrow().getKey();
                    return new OtherTextGroup(assetTypes.get(first.getAssetId()), first.getOtherTextNormalized(),
                            sample, list.size(), (int) list.stream().filter(Issue::isOpen).count(),
                            list.stream().map(Issue::getCreatedAt).max(Comparator.naturalOrder()).orElseThrow());
                })
                .sorted(Comparator.comparingInt(OtherTextGroup::count).reversed()
                        .thenComparing(OtherTextGroup::lastReportedAt, Comparator.reverseOrder()))
                .toList();
    }

    private Map<UUID, String> assetTypesOf(UUID buildingId) {
        return assets.findByBuildingId(buildingId).stream()
                .collect(Collectors.toMap(Asset::getId, Asset::getAssetTypeCode));
    }

    private Map<UUID, Space> spacesOf(UUID buildingId) {
        return IssueViews.index(spaces.findByBuildingIdOrderByDepthAscSortOrderAscNameAsc(buildingId));
    }
}

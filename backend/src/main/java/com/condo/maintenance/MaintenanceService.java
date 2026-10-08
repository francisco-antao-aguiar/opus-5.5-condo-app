package com.condo.maintenance;

import com.condo.asset.Asset;
import com.condo.asset.AssetRepository;
import com.condo.building.Building;
import com.condo.building.BuildingRepository;
import com.condo.common.error.ApiException;
import com.condo.common.error.ErrorCodes;
import com.condo.common.persistence.Versions;
import com.condo.governance.AccessGuard;
import com.condo.governance.Action;
import com.condo.governance.SpacePrivacy;
import com.condo.issue.Issue;
import com.condo.issue.IssueAccess;
import com.condo.issue.IssueAffected;
import com.condo.issue.IssueAffectedRepository;
import com.condo.issue.IssueEvent;
import com.condo.issue.IssueEventRepository;
import com.condo.issue.IssueEventType;
import com.condo.issue.IssueRepository;
import com.condo.issue.IssueViews;
import com.condo.maintenance.MaintenanceDtos.MaintenancePlanDto;
import com.condo.maintenance.MaintenanceDtos.RecurrencePreview;
import com.condo.maintenance.MaintenanceDtos.RecurrencePreviewRequest;
import com.condo.maintenance.MaintenanceDtos.SaveMaintenancePlanRequest;
import com.condo.member.Membership;
import com.condo.member.MembershipRepository;
import com.condo.notification.NotificationRequest;
import com.condo.notification.NotificationType;
import com.condo.space.Space;
import com.condo.space.SpaceRepository;
import com.condo.space.SpaceService;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/** Maintenance plans and the scheduled tasks (issues of kind SCHEDULED) they generate. */
@Service
@Transactional
public class MaintenanceService {

    /** Safety net for the generator loop (a daily plan with 90 lead days is the realistic worst case). */
    private static final int MAX_GENERATED_PER_RUN = 120;

    private final MaintenancePlanRepository plans;
    private final AssetRepository assets;
    private final SpaceRepository spaces;
    private final BuildingRepository buildings;
    private final IssueRepository issues;
    private final IssueEventRepository events;
    private final IssueAffectedRepository affected;
    private final MembershipRepository memberships;
    private final AccessGuard guard;
    private final SpacePrivacy privacy;
    private final IssueAccess issueAccess;
    private final IssueViews issueViews;
    private final ApplicationEventPublisher publisher;
    private final Clock clock;

    public MaintenanceService(MaintenancePlanRepository plans, AssetRepository assets, SpaceRepository spaces,
            BuildingRepository buildings, IssueRepository issues, IssueEventRepository events,
            IssueAffectedRepository affected, MembershipRepository memberships, AccessGuard guard,
            SpacePrivacy privacy, IssueAccess issueAccess, IssueViews issueViews, ApplicationEventPublisher publisher,
            Clock clock) {
        this.plans = plans;
        this.assets = assets;
        this.spaces = spaces;
        this.buildings = buildings;
        this.issues = issues;
        this.events = events;
        this.affected = affected;
        this.memberships = memberships;
        this.guard = guard;
        this.privacy = privacy;
        this.issueAccess = issueAccess;
        this.issueViews = issueViews;
        this.publisher = publisher;
        this.clock = clock;
    }

    // ===================== plans =====================

    /** Plans on private spaces are only listed to those who can see that space (the rule assets follow). */
    @Transactional(readOnly = true)
    public List<MaintenancePlanDto> list(UUID buildingId) {
        Membership member = guard.require(buildingId, Action.MAINTENANCE_VIEW);
        Context ctx = context(buildingId);
        return plans.findByBuildingIdOrderByTitleAsc(buildingId).stream()
                .filter(p -> canSee(member, p, ctx))
                .map(p -> toDto(p, ctx))
                .toList();
    }

    @Transactional(readOnly = true)
    public MaintenancePlanDto get(UUID buildingId, UUID planId) {
        Membership member = guard.require(buildingId, Action.MAINTENANCE_VIEW);
        MaintenancePlan plan = find(buildingId, planId);
        Context ctx = context(buildingId);
        if (!canSee(member, plan, ctx)) {
            throw ApiException.notFound("Maintenance plan");
        }
        return toDto(plan, ctx);
    }

    public MaintenancePlanDto create(UUID buildingId, SaveMaintenancePlanRequest req) {
        Context ctx = context(buildingId);
        Target target = target(buildingId, req, ctx);
        Membership member = guard.require(buildingId, Action.MAINTENANCE_MANAGE, target.space());
        MaintenancePlan plan = new MaintenancePlan(buildingId, member.getUser().getId());
        define(plan, req, target);
        LocalDate today = issueViews.today(buildingId);
        plan.scheduleFrom(max(plan.getStartsOn(), today));
        plans.save(plan);
        generateDue(plan, today);
        return toDto(plan, context(buildingId));
    }

    public MaintenancePlanDto update(UUID buildingId, UUID planId, SaveMaintenancePlanRequest req) {
        MaintenancePlan plan = find(buildingId, planId);
        Context ctx = context(buildingId);
        guard.require(buildingId, Action.MAINTENANCE_MANAGE, ctx.targetSpace(plan));
        Target target = target(buildingId, req, ctx);
        guard.require(buildingId, Action.MAINTENANCE_MANAGE, target.space());
        Versions.requireCurrent(req.version(), plan);
        define(plan, req, target);
        LocalDate today = issueViews.today(buildingId);
        plan.scheduleFrom(max(plan.getStartsOn(), today));
        plans.flush();
        generateDue(plan, today);
        return toDto(plan, context(buildingId));
    }

    public MaintenancePlanDto pause(UUID buildingId, UUID planId) {
        MaintenancePlan plan = find(buildingId, planId);
        Context ctx = context(buildingId);
        guard.require(buildingId, Action.MAINTENANCE_MANAGE, ctx.targetSpace(plan));
        plan.pause(MaintenancePlan.PausedReason.MANUAL);
        plans.flush();
        return toDto(plan, ctx);
    }

    /** Resuming never back-fills missed dates: it schedules from today. */
    public MaintenancePlanDto resume(UUID buildingId, UUID planId) {
        MaintenancePlan plan = find(buildingId, planId);
        Context ctx = context(buildingId);
        guard.require(buildingId, Action.MAINTENANCE_MANAGE, ctx.targetSpace(plan));
        if (plan.getAssetId() != null && assets.findById(plan.getAssetId()).map(Asset::isArchived).orElse(true)) {
            throw ApiException.conflict(ErrorCodes.ASSET_ARCHIVED, "Restore the item before resuming its plan.");
        }
        LocalDate today = issueViews.today(buildingId);
        plan.resume(today);
        plans.flush();
        generateDue(plan, today);
        return toDto(plan, context(buildingId));
    }

    @Transactional(readOnly = true)
    public RecurrencePreview preview(UUID buildingId, RecurrencePreviewRequest req) {
        guard.require(buildingId, Action.MAINTENANCE_VIEW);
        Recurrence r = req.recurrence().normalized(req.startsOn());
        LocalDate from = max(req.startsOn(), issueViews.today(buildingId));
        int count = req.count() != null ? req.count() : 5;
        return new RecurrencePreview(r.occurrences(req.startsOn(), req.endsOn(), from, count),
                r.describe(req.startsOn()));
    }

    // ===================== generation (also called by MaintenanceJob) =====================

    /** One plan, in its own transaction so one bad plan can't stop the others. */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public int runPlan(UUID planId) {
        MaintenancePlan plan = plans.findById(planId).orElse(null);
        return plan == null ? 0 : generateDue(plan, issueViews.today(plan.getBuildingId()));
    }

    /**
     * Creates every occurrence already due plus at most one upcoming one inside the lead window, so a daily plan
     * doesn't flood the board. The unique (plan, due date) key makes this safe to rerun.
     */
    int generateDue(MaintenancePlan plan, LocalDate today) {
        int created = 0;
        for (int guardCount = 0; guardCount < MAX_GENERATED_PER_RUN && plan.isDueForGeneration(today); guardCount++) {
            LocalDate due = plan.getNextDueOn();
            if (!issues.existsByMaintenancePlanIdAndDueOn(plan.getId(), due)) {
                createTask(plan, due);
                created++;
            }
            plan.advance();
            if (due.isAfter(today)) {
                break;
            }
        }
        return created;
    }

    /** Tells triagers (and the task's people) once that a task is past due. */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public int flagOverdue(UUID buildingId) {
        LocalDate today = issueViews.today(buildingId);
        Instant now = clock.instant();
        List<Issue> overdue = issues.findOverdueUnnotified(buildingId, today);
        for (Issue task : overdue) {
            Set<UUID> recipients = triagers(task);
            affected.findByIdIssueId(task.getId()).forEach(a -> recipients.add(a.getUserId()));
            publish(task, NotificationType.TASK_OVERDUE, recipients, "Overdue since " + task.getDueOn());
            task.markOverdueNotified(now);
        }
        return overdue.size();
    }

    private void createTask(MaintenancePlan plan, LocalDate due) {
        Map<UUID, Space> spacesById = IssueViews.index(
                spaces.findByBuildingIdOrderByDepthAscSortOrderAscNameAsc(plan.getBuildingId()));
        UUID spaceId = plan.getSpaceId() != null ? plan.getSpaceId()
                : assets.findById(plan.getAssetId()).map(Asset::getSpaceId).orElse(null);
        Space space = spaceId != null ? spacesById.get(spaceId) : null;
        if (space == null) {
            plan.pause(MaintenancePlan.PausedReason.ASSET_ARCHIVED);
            return;
        }
        Instant now = clock.instant();
        Building building = buildings.findByIdForUpdate(plan.getBuildingId()).orElseThrow();
        Issue task = issues.save(Issue.scheduled(plan.getBuildingId(), building.nextIssueNumber(), plan.getAssetId(),
                space.getId(), SpaceService.pathLabel(space, spacesById), plan.getTitle(),
                SpaceService.effectiveVisibility(space, spacesById), plan.getCreatedByUserId(), plan.getId(), due,
                plan.getChecklist(), now));
        affected.save(new IssueAffected(task.getId(), plan.getCreatedByUserId(), IssueAffected.Kind.REPORTER, now));
        events.save(IssueEvent.of(task, plan.getCreatedByUserId(), IssueEventType.REPORTED,
                "Scheduled maintenance, due " + due, now));
        publish(task, NotificationType.TASK_DUE, triagers(task),
                "Maintenance due " + due + " · " + task.getLocationLabel());
    }

    private Set<UUID> triagers(Issue task) {
        Space space = task.getSpaceId() != null ? spaces.findById(task.getSpaceId()).orElse(null) : null;
        Instant now = clock.instant();
        return memberships.findByBuildingWithUsers(task.getBuildingId()).stream()
                .filter(m -> m.isActiveAt(now) && issueAccess.canTriage(m, task, space))
                .map(m -> m.getUser().getId())
                .collect(Collectors.toCollection(LinkedHashSet::new));
    }

    private void publish(Issue task, NotificationType type, Set<UUID> recipients, String body) {
        publisher.publishEvent(new NotificationRequest(task.getBuildingId(), recipients, type, task.getId(),
                "#" + task.getNumber() + " " + task.getOtherText(), body,
                "/buildings/" + task.getBuildingId() + "/issues/" + task.getId()));
    }

    // ===================== helpers =====================

    private record Target(UUID assetId, UUID spaceId, Space space) {
    }

    private Target target(UUID buildingId, SaveMaintenancePlanRequest req, Context ctx) {
        if ((req.assetId() == null) == (req.spaceId() == null)) {
            throw ApiException.invalidField("assetId", "Choose either an item or a place");
        }
        if (req.assetId() != null) {
            Asset asset = assets.findByIdAndBuildingId(req.assetId(), buildingId)
                    .orElseThrow(() -> ApiException.notFound("Asset"));
            if (asset.isArchived()) {
                throw ApiException.conflict(ErrorCodes.ASSET_ARCHIVED, "That item is archived.");
            }
            return new Target(asset.getId(), null, ctx.spaces().get(asset.getSpaceId()));
        }
        Space space = ctx.spaces().get(req.spaceId());
        if (space == null) {
            throw ApiException.notFound("Space");
        }
        return new Target(null, space.getId(), space);
    }

    private void define(MaintenancePlan plan, SaveMaintenancePlanRequest req, Target target) {
        Recurrence recurrence = req.recurrence().normalized(req.startsOn());
        if (req.endsOn() != null && req.endsOn().isBefore(req.startsOn())) {
            throw ApiException.invalidField("endsOn", "must be on or after the start date");
        }
        List<String> checklist = req.checklist() == null ? List.of()
                : req.checklist().stream().map(String::trim).filter(s -> !s.isEmpty()).toList();
        plan.define(target.assetId(), target.spaceId(), req.title().trim(), blankToNull(req.description()),
                checklist, recurrence, req.startsOn(), req.endsOn(), req.leadDays() != null ? req.leadDays() : 7,
                blankToNull(req.assigneeNote()));
    }

    private boolean canSee(Membership member, MaintenancePlan plan, Context ctx) {
        Space space = ctx.targetSpace(plan);
        return space == null || privacy.canSee(member, space, SpaceService.effectiveVisibility(space, ctx.spaces()));
    }

    private MaintenancePlan find(UUID buildingId, UUID planId) {
        return plans.findByIdAndBuildingId(planId, buildingId)
                .orElseThrow(() -> ApiException.notFound("Maintenance plan"));
    }

    private MaintenancePlanDto toDto(MaintenancePlan p, Context ctx) {
        Space space = ctx.targetSpace(p);
        Asset asset = p.getAssetId() != null ? ctx.assets().get(p.getAssetId()) : null;
        UUID openTask = issues.findOpenTasksOfPlan(p.getId()).stream().findFirst().map(Issue::getId).orElse(null);
        return new MaintenancePlanDto(p.getId(), p.getBuildingId(), p.getAssetId(),
                asset != null ? asset.getName() : null, p.getSpaceId(),
                space != null ? SpaceService.pathLabel(space, ctx.spaces()) : "", p.getTitle(), p.getDescription(),
                p.getChecklist(), p.getRecurrence(), p.getRecurrence().describe(p.getStartsOn()), p.getStartsOn(),
                p.getEndsOn(), p.getLeadDays(), p.getAssigneeNote(), p.isActive(), p.getPausedReason(),
                p.getNextDueOn(), openTask, p.getCreatedAt(), p.getVersion() != null ? p.getVersion() : 0L);
    }

    private Context context(UUID buildingId) {
        return new Context(
                IssueViews.index(spaces.findByBuildingIdOrderByDepthAscSortOrderAscNameAsc(buildingId)),
                assets.findByBuildingId(buildingId).stream().collect(Collectors.toMap(Asset::getId, Function.identity())));
    }

    private record Context(Map<UUID, Space> spaces, Map<UUID, Asset> assets) {

        Space targetSpace(MaintenancePlan p) {
            if (p.getSpaceId() != null) {
                return spaces.get(p.getSpaceId());
            }
            Asset a = assets.get(p.getAssetId());
            return a != null && a.getSpaceId() != null ? spaces.get(a.getSpaceId()) : null;
        }
    }

    private static LocalDate max(LocalDate a, LocalDate b) {
        return a.isAfter(b) ? a : b;
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}

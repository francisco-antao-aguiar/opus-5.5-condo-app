package com.condo.notification;

import com.condo.asset.Asset;
import com.condo.asset.AssetRepository;
import com.condo.asset.ProblemType;
import com.condo.asset.ProblemTypeRepository;
import com.condo.auth.User;
import com.condo.auth.UserRepository;
import com.condo.building.Building;
import com.condo.building.BuildingRepository;
import com.condo.issue.Issue;
import com.condo.issue.IssueAccess;
import com.condo.issue.IssueActivity;
import com.condo.issue.IssueEvent;
import com.condo.issue.IssueEventRepository;
import com.condo.issue.IssueRepository;
import com.condo.issue.IssueStatus;
import com.condo.issue.IssueViews;
import com.condo.member.Membership;
import com.condo.member.MembershipRepository;
import com.condo.space.Space;
import com.condo.space.SpaceRepository;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Turns issue activity into in-app notifications and pushes. Runs after the issue change committed, in its own
 * transaction, and sends pushes outside it so a slow push provider never holds a database connection.
 */
@Service
public class NotificationService {

    private static final Logger log = LoggerFactory.getLogger(NotificationService.class);

    private final NotificationRepository notifications;
    private final PushTokenRepository pushTokens;
    private final IssueRepository issues;
    private final IssueEventRepository events;
    private final AssetRepository assets;
    private final ProblemTypeRepository problemTypes;
    private final BuildingRepository buildings;
    private final SpaceRepository spaces;
    private final MembershipRepository memberships;
    private final UserRepository users;
    private final IssueAccess access;
    private final IssueViews views;
    private final PushSender pushSender;
    private final TransactionTemplate tx;
    private final Clock clock;

    public NotificationService(NotificationRepository notifications, PushTokenRepository pushTokens,
            IssueRepository issues, IssueEventRepository events, AssetRepository assets,
            ProblemTypeRepository problemTypes, BuildingRepository buildings, SpaceRepository spaces,
            MembershipRepository memberships, UserRepository users, IssueAccess access, IssueViews views,
            PushSender pushSender, PlatformTransactionManager txManager, Clock clock) {
        this.notifications = notifications;
        this.pushTokens = pushTokens;
        this.issues = issues;
        this.events = events;
        this.assets = assets;
        this.problemTypes = problemTypes;
        this.buildings = buildings;
        this.spaces = spaces;
        this.memberships = memberships;
        this.users = users;
        this.access = access;
        this.views = views;
        this.pushSender = pushSender;
        this.tx = new TransactionTemplate(txManager);
        this.tx.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        this.clock = clock;
    }

    public void deliver(IssueActivity activity) {
        push(tx.execute(status -> compose(activity).map(this::store).orElse(List.of())));
    }

    /** Generic delivery for any feature (bookings, maintenance tasks…). */
    public void deliver(NotificationRequest request) {
        push(tx.execute(status -> store(request)));
    }

    private void push(List<PushMessage> pushes) {
        if (pushes == null || pushes.isEmpty()) {
            return;
        }
        Set<String> dead = pushSender.send(pushes);
        if (!dead.isEmpty()) {
            tx.executeWithoutResult(status -> pushTokens.deleteByTokenIn(dead));
            log.info("Forgot {} push token(s) of uninstalled apps", dead.size());
        }
    }

    /** Stores one in-app notification per recipient and returns the pushes to send. */
    private List<PushMessage> store(NotificationRequest r) {
        if (r.recipients().isEmpty()) {
            return List.of();
        }
        Instant now = clock.instant();
        List<Notification> created = new ArrayList<>();
        for (UUID user : r.recipients()) {
            created.add(new Notification(user, r.buildingId(), r.issueId(), r.type(), r.title(), r.body(), r.link(),
                    now));
        }
        notifications.saveAll(created);
        String buildingName = buildings.findById(r.buildingId()).map(Building::getName).orElse("");
        String pushTitle = Notification.truncate(r.title() + " · " + buildingName, 120);
        List<PushMessage> pushes = new ArrayList<>();
        for (PushToken t : pushTokens.findByUserIdIn(r.recipients())) {
            pushes.add(new PushMessage(t.getToken(), pushTitle, Notification.truncate(r.body(), 180), r.link()));
        }
        return pushes;
    }

    /** Who should hear about this issue activity, and what to tell them. */
    private java.util.Optional<NotificationRequest> compose(IssueActivity a) {
        NotificationType type = switch (a.type()) {
            case REPORTED -> NotificationType.ISSUE_REPORTED;
            case STATUS_CHANGED -> NotificationType.ISSUE_STATUS_CHANGED;
            case COMMENT -> NotificationType.ISSUE_COMMENTED;
            case MERGED_INTO -> NotificationType.ISSUE_MERGED;
            default -> null; // me too, photos, sharing… stay in the timeline only
        };
        Issue issue = issues.findById(a.issueId()).orElse(null);
        IssueEvent event = events.findById(a.eventId()).orElse(null);
        Building building = buildings.findById(a.buildingId()).orElse(null);
        if (type == null || issue == null || event == null || building == null) {
            return java.util.Optional.empty();
        }
        Space space = issue.getSpaceId() != null ? spaces.findById(issue.getSpaceId()).orElse(null) : null;
        Instant now = clock.instant();
        Map<UUID, Membership> members = memberships.findByBuildingWithUsers(building.getId()).stream()
                .filter(m -> m.isActiveAt(now))
                .collect(Collectors.toMap(m -> m.getUser().getId(), Function.identity()));

        Set<UUID> recipients = new LinkedHashSet<>();
        if (type == NotificationType.ISSUE_REPORTED) {
            // Whoever can act on it: triagers, or the unit itself for an unshared private issue.
            members.values().stream()
                    .filter(m -> !m.getUser().getId().equals(a.actorUserId()))
                    .filter(m -> access.canTriage(m, issue, space))
                    .forEach(m -> recipients.add(m.getUser().getId()));
        } else {
            // The affected people, as long as they still belong to the building and may still see the issue.
            a.audience().stream()
                    .filter(u -> members.containsKey(u) && access.canSee(members.get(u), issue, space))
                    .forEach(recipients::add);
        }
        if (recipients.isEmpty()) {
            return java.util.Optional.empty();
        }

        String actor = users.findById(a.actorUserId()).map(User::getDisplayName).orElse("Someone");
        String title = "#" + issue.getNumber() + " " + issueTitle(issue);
        String body = body(type, issue, event, actor);
        UUID linkIssue = type == NotificationType.ISSUE_MERGED && event.getRelatedIssueId() != null
                ? event.getRelatedIssueId() : issue.getId();
        String link = "/buildings/" + building.getId() + "/issues/" + linkIssue;
        return java.util.Optional.of(
                new NotificationRequest(building.getId(), recipients, type, issue.getId(), title, body, link));
    }

    private String issueTitle(Issue issue) {
        Map<UUID, ProblemType> byId = new HashMap<>();
        if (issue.getProblemTypeId() != null) {
            problemTypes.findById(issue.getProblemTypeId()).ifPresent(p -> byId.put(p.getId(), p));
        }
        return views.title(issue, byId);
    }

    private String body(NotificationType type, Issue issue, IssueEvent event, String actor) {
        String comment = event.getComment();
        return switch (type) {
            case ISSUE_REPORTED -> {
                String what = issue.getAssetId() != null
                        ? assets.findById(issue.getAssetId()).map(Asset::getName).orElse("Item") + " · " : "";
                yield what + issue.getLocationLabel() + " · reported by " + actor;
            }
            case ISSUE_STATUS_CHANGED -> {
                boolean reopened = event.getFromStatus() == IssueStatus.RESOLVED
                        && event.getToStatus() == IssueStatus.REPORTED;
                String what = reopened ? "Reopened" : statusLabel(event.getToStatus());
                yield what + " by " + actor + (comment != null ? ": " + comment : "");
            }
            case ISSUE_COMMENTED -> actor + ": " + (comment != null ? comment : "");
            case ISSUE_MERGED -> {
                String target = event.getRelatedIssueId() != null
                        ? issues.findById(event.getRelatedIssueId()).map(i -> "#" + i.getNumber()).orElse("another issue")
                        : "another issue";
                yield "Merged into " + target + " by " + actor + " — you'll get its updates";
            }
            // Task and booking notifications are composed by their own features, never from issue activity.
            default -> throw new IllegalArgumentException("Not an issue notification: " + type);
        };
    }

    private static String statusLabel(IssueStatus status) {
        return switch (status) {
            case REPORTED -> "Reported";
            case ACKNOWLEDGED -> "Acknowledged";
            case IN_PROGRESS -> "Work started";
            case RESOLVED -> "Resolved";
        };
    }
}

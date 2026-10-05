package com.condo.issue;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

/** One line of an issue's timeline. Append-only. */
@Entity
@Table(name = "issue_event")
public class IssueEvent {

    @Id
    private UUID id = UUID.randomUUID();

    @Column(name = "issue_id", nullable = false)
    private UUID issueId;

    @Column(name = "actor_user_id", nullable = false)
    private UUID actorUserId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    private IssueEventType type;

    @Enumerated(EnumType.STRING)
    @Column(name = "from_status", length = 16)
    private IssueStatus fromStatus;

    @Enumerated(EnumType.STRING)
    @Column(name = "to_status", length = 16)
    private IssueStatus toStatus;

    @Column(length = 1000)
    private String comment;

    @Column(name = "related_issue_id")
    private UUID relatedIssueId;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected IssueEvent() {
    }

    private IssueEvent(UUID issueId, UUID actorUserId, IssueEventType type, Instant now) {
        this.issueId = issueId;
        this.actorUserId = actorUserId;
        this.type = type;
        this.createdAt = now;
    }

    public static IssueEvent of(Issue issue, UUID actor, IssueEventType type, String comment, Instant now) {
        IssueEvent e = new IssueEvent(issue.getId(), actor, type, now);
        e.comment = comment;
        return e;
    }

    public static IssueEvent statusChange(Issue issue, UUID actor, IssueStatus from, IssueStatus to, String comment,
            Instant now) {
        IssueEvent e = of(issue, actor, IssueEventType.STATUS_CHANGED, comment, now);
        e.fromStatus = from;
        e.toStatus = to;
        return e;
    }

    public static IssueEvent related(Issue issue, UUID actor, IssueEventType type, UUID relatedIssueId,
            String comment, Instant now) {
        IssueEvent e = of(issue, actor, type, comment, now);
        e.relatedIssueId = relatedIssueId;
        return e;
    }

    public UUID getId() {
        return id;
    }

    public UUID getIssueId() {
        return issueId;
    }

    public UUID getActorUserId() {
        return actorUserId;
    }

    public IssueEventType getType() {
        return type;
    }

    public IssueStatus getFromStatus() {
        return fromStatus;
    }

    public IssueStatus getToStatus() {
        return toStatus;
    }

    public String getComment() {
        return comment;
    }

    public UUID getRelatedIssueId() {
        return relatedIssueId;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}

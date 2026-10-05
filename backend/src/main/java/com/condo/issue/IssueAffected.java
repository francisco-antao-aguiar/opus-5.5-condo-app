package com.condo.issue;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import java.io.Serializable;
import java.time.Instant;
import java.util.UUID;

/** Someone affected by an issue: its reporter or a "me too". They're subscribed to its updates. */
@Entity
@Table(name = "issue_affected")
public class IssueAffected {

    public enum Kind { REPORTER, ME_TOO }

    @EmbeddedId
    private Key id;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private Kind kind;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected IssueAffected() {
    }

    public IssueAffected(UUID issueId, UUID userId, Kind kind, Instant now) {
        this.id = new Key(issueId, userId);
        this.kind = kind;
        this.createdAt = now;
    }

    public Key getId() {
        return id;
    }

    public UUID getUserId() {
        return id.userId();
    }

    public Kind getKind() {
        return kind;
    }

    @Embeddable
    public record Key(
            @Column(name = "issue_id") UUID issueId,
            @Column(name = "user_id") UUID userId) implements Serializable {
    }
}

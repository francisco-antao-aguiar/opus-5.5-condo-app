package com.condo.issue;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

/** Metadata of an issue photo; the bytes live in {@link com.condo.common.storage.StorageService}. */
@Entity
@Table(name = "issue_photo")
public class IssuePhoto {

    @Id
    private UUID id = UUID.randomUUID();

    @Column(name = "issue_id", nullable = false)
    private UUID issueId;

    @Column(name = "storage_key", nullable = false, length = 255)
    private String storageKey;

    @Column(name = "content_type", nullable = false, length = 64)
    private String contentType;

    @Column(name = "size_bytes", nullable = false)
    private long sizeBytes;

    @Column(name = "uploaded_by_user_id", nullable = false)
    private UUID uploadedByUserId;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected IssuePhoto() {
    }

    /** The storage key is derived from ids only (never user input), so it can't be used for path tricks. */
    public IssuePhoto(UUID buildingId, UUID issueId, String extension, String contentType, long sizeBytes,
            UUID uploadedByUserId, Instant now) {
        this.issueId = issueId;
        this.storageKey = "issues/" + buildingId + "/" + issueId + "/" + id + "." + extension;
        this.contentType = contentType;
        this.sizeBytes = sizeBytes;
        this.uploadedByUserId = uploadedByUserId;
        this.createdAt = now;
    }

    public UUID getId() {
        return id;
    }

    public UUID getIssueId() {
        return issueId;
    }

    public String getStorageKey() {
        return storageKey;
    }

    public String getContentType() {
        return contentType;
    }

    public long getSizeBytes() {
        return sizeBytes;
    }

    public UUID getUploadedByUserId() {
        return uploadedByUserId;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}

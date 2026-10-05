package com.condo.issue;

import java.util.UUID;

/** Someone opened an issue's detail; their notifications about it are now read. */
public record IssueViewed(UUID issueId, UUID userId) {
}

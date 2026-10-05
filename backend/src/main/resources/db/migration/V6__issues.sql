-- Phase 4: issues, "me too", timeline, photos.

-- Per-building issue numbers (#1, #2…), incremented under a row lock.
ALTER TABLE building ADD COLUMN issue_seq INT NOT NULL DEFAULT 0;

CREATE TABLE issue (
    id                     UUID PRIMARY KEY,
    version                BIGINT NOT NULL DEFAULT 0,
    building_id            UUID NOT NULL REFERENCES building (id) ON DELETE CASCADE,
    number                 INT NOT NULL,
    asset_id               UUID REFERENCES asset (id) ON DELETE SET NULL,
    space_id               UUID REFERENCES space (id) ON DELETE SET NULL,
    -- Snapshot so history stays readable after renames/deletes.
    location_label         VARCHAR(400) NOT NULL,
    problem_type_id        UUID REFERENCES problem_type (id),
    other_text             VARCHAR(200),
    other_text_normalized  VARCHAR(200),
    note                   VARCHAR(1000),
    status                 VARCHAR(16) NOT NULL,
    visibility             VARCHAR(16) NOT NULL,
    shared_with_admins     BOOLEAN NOT NULL DEFAULT FALSE,
    reporter_user_id       UUID NOT NULL REFERENCES app_user (id),
    merged_into_id         UUID REFERENCES issue (id) ON DELETE SET NULL,
    affected_count         INT NOT NULL DEFAULT 1,
    client_request_id      UUID,
    status_changed_at      TIMESTAMP WITH TIME ZONE NOT NULL,
    last_activity_at       TIMESTAMP WITH TIME ZONE NOT NULL,
    resolved_at            TIMESTAMP WITH TIME ZONE,
    created_at             TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at             TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT uk_issue_number UNIQUE (building_id, number),
    -- Idempotent submits: one issue per (reporter, client request id). NULLs don't collide.
    CONSTRAINT uk_issue_client_request UNIQUE (reporter_user_id, client_request_id),
    CONSTRAINT ck_issue_problem CHECK (problem_type_id IS NOT NULL OR other_text IS NOT NULL),
    CONSTRAINT ck_issue_status CHECK (status IN ('REPORTED', 'ACKNOWLEDGED', 'IN_PROGRESS', 'RESOLVED')),
    CONSTRAINT ck_issue_visibility CHECK (visibility IN ('COMMON', 'PRIVATE'))
);
CREATE INDEX ix_issue_building_status ON issue (building_id, status);
CREATE INDEX ix_issue_asset_status ON issue (asset_id, status);
CREATE INDEX ix_issue_space ON issue (space_id);

-- Reporter + everyone who said "me too": the affected count and the notification audience.
CREATE TABLE issue_affected (
    issue_id    UUID NOT NULL REFERENCES issue (id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    kind        VARCHAR(16) NOT NULL,
    created_at  TIMESTAMP WITH TIME ZONE NOT NULL,
    PRIMARY KEY (issue_id, user_id),
    CONSTRAINT ck_issue_affected_kind CHECK (kind IN ('REPORTER', 'ME_TOO'))
);
CREATE INDEX ix_issue_affected_user ON issue_affected (user_id);

-- Append-only timeline.
CREATE TABLE issue_event (
    id                UUID PRIMARY KEY,
    issue_id          UUID NOT NULL REFERENCES issue (id) ON DELETE CASCADE,
    actor_user_id     UUID NOT NULL REFERENCES app_user (id),
    type              VARCHAR(32) NOT NULL,
    from_status       VARCHAR(16),
    to_status         VARCHAR(16),
    comment           VARCHAR(1000),
    related_issue_id  UUID REFERENCES issue (id) ON DELETE SET NULL,
    created_at        TIMESTAMP WITH TIME ZONE NOT NULL
);
CREATE INDEX ix_issue_event_issue ON issue_event (issue_id, created_at);

CREATE TABLE issue_photo (
    id                   UUID PRIMARY KEY,
    issue_id             UUID NOT NULL REFERENCES issue (id) ON DELETE CASCADE,
    storage_key          VARCHAR(255) NOT NULL,
    content_type         VARCHAR(64) NOT NULL,
    size_bytes           BIGINT NOT NULL,
    uploaded_by_user_id  UUID NOT NULL REFERENCES app_user (id),
    created_at           TIMESTAMP WITH TIME ZONE NOT NULL
);
CREATE INDEX ix_issue_photo_issue ON issue_photo (issue_id);

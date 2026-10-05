-- Phase 5: push tokens and the in-app notification list.

CREATE TABLE push_token (
    id            UUID PRIMARY KEY,
    user_id       UUID NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    token         VARCHAR(255) NOT NULL,
    platform      VARCHAR(16) NOT NULL,
    device_name   VARCHAR(120),
    created_at    TIMESTAMP WITH TIME ZONE NOT NULL,
    last_seen_at  TIMESTAMP WITH TIME ZONE NOT NULL,
    -- One device = one token; re-registering moves it to whoever is signed in now.
    CONSTRAINT uk_push_token UNIQUE (token),
    CONSTRAINT ck_push_token_platform CHECK (platform IN ('ios', 'android', 'web'))
);
CREATE INDEX ix_push_token_user ON push_token (user_id);

CREATE TABLE notification (
    id           UUID PRIMARY KEY,
    user_id      UUID NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    building_id  UUID NOT NULL REFERENCES building (id) ON DELETE CASCADE,
    issue_id     UUID REFERENCES issue (id) ON DELETE CASCADE,
    type         VARCHAR(32) NOT NULL,
    title        VARCHAR(200) NOT NULL,
    body         VARCHAR(500) NOT NULL,
    -- App-relative route, the same on web and mobile.
    link         VARCHAR(300) NOT NULL,
    read_at      TIMESTAMP WITH TIME ZONE,
    created_at   TIMESTAMP WITH TIME ZONE NOT NULL
);
CREATE INDEX ix_notification_user_created ON notification (user_id, created_at);
CREATE INDEX ix_notification_user_unread ON notification (user_id, read_at);

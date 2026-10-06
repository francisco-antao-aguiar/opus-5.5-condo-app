-- Phase 6: shared-space booking. Every request is reviewed by an admin; no payments.

CREATE TABLE booking_policy (
    space_id               UUID PRIMARY KEY REFERENCES space (id) ON DELETE CASCADE,
    version                BIGINT NOT NULL DEFAULT 0,
    building_id            UUID NOT NULL REFERENCES building (id) ON DELETE CASCADE,
    enabled                BOOLEAN NOT NULL DEFAULT TRUE,
    slot_minutes           INT NOT NULL,
    min_minutes            INT NOT NULL,
    max_minutes            INT NOT NULL,
    opening_hours          VARCHAR(2000) NOT NULL,   -- JSON {"MON":[["10:00","22:00"]], …}, building-local times
    advance_days           INT NOT NULL,
    max_active_per_unit    INT,
    cancel_cutoff_hours    INT NOT NULL DEFAULT 24,
    rules_text             VARCHAR(2000),
    created_at             TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at             TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT ck_policy_minutes CHECK (slot_minutes > 0 AND min_minutes >= slot_minutes AND max_minutes >= min_minutes)
);
CREATE INDEX ix_booking_policy_building ON booking_policy (building_id);

CREATE TABLE booking (
    id                     UUID PRIMARY KEY,
    version                BIGINT NOT NULL DEFAULT 0,
    building_id            UUID NOT NULL REFERENCES building (id) ON DELETE CASCADE,
    -- Spaces with future bookings can't be deleted (service guard); past ones go with the space.
    space_id               UUID NOT NULL REFERENCES space (id) ON DELETE CASCADE,
    membership_id          UUID NOT NULL REFERENCES membership (id) ON DELETE CASCADE,
    user_id                UUID NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    unit_space_id          UUID REFERENCES space (id) ON DELETE SET NULL,
    starts_at              TIMESTAMP WITH TIME ZONE NOT NULL,
    ends_at                TIMESTAMP WITH TIME ZONE NOT NULL,
    status                 VARCHAR(16) NOT NULL,
    note                   VARCHAR(500),
    decision_note          VARCHAR(500),
    decided_by_user_id     UUID REFERENCES app_user (id) ON DELETE SET NULL,
    decided_at             TIMESTAMP WITH TIME ZONE,
    cancelled_by_user_id   UUID REFERENCES app_user (id) ON DELETE SET NULL,
    cancelled_at           TIMESTAMP WITH TIME ZONE,
    reminded_at            TIMESTAMP WITH TIME ZONE,
    created_at             TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at             TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT ck_booking_range CHECK (ends_at > starts_at),
    CONSTRAINT ck_booking_status CHECK (status IN ('PENDING', 'CONFIRMED', 'REJECTED', 'CANCELLED'))
);
CREATE INDEX ix_booking_space_start ON booking (space_id, starts_at);
CREATE INDEX ix_booking_building_status ON booking (building_id, status);
CREATE INDEX ix_booking_user ON booking (user_id);

-- Anyone may request; only admins and managers review, in both presets.
INSERT INTO permission_policy (governance_mode, action, role_code, scope) VALUES
    ('MANAGED', 'BOOKING_CREATE', 'ADMIN',   'ANY'),
    ('MANAGED', 'BOOKING_CREATE', 'MANAGER', 'ANY'),
    ('MANAGED', 'BOOKING_CREATE', 'OWNER',   'ANY'),
    ('MANAGED', 'BOOKING_CREATE', 'TENANT',  'ANY'),
    ('MANAGED', 'BOOKING_MANAGE', 'ADMIN',   'ANY'),
    ('MANAGED', 'BOOKING_MANAGE', 'MANAGER', 'ANY'),
    ('OPEN',    'BOOKING_CREATE', 'ADMIN',   'ANY'),
    ('OPEN',    'BOOKING_CREATE', 'MANAGER', 'ANY'),
    ('OPEN',    'BOOKING_CREATE', 'OWNER',   'ANY'),
    ('OPEN',    'BOOKING_CREATE', 'TENANT',  'ANY'),
    ('OPEN',    'BOOKING_MANAGE', 'ADMIN',   'ANY'),
    ('OPEN',    'BOOKING_MANAGE', 'MANAGER', 'ANY');

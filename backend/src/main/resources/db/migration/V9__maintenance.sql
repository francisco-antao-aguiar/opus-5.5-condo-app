-- Phase 6: maintenance plans; their occurrences are issues of kind SCHEDULED.

CREATE TABLE maintenance_plan (
    id                  UUID PRIMARY KEY,
    version             BIGINT NOT NULL DEFAULT 0,
    building_id         UUID NOT NULL REFERENCES building (id) ON DELETE CASCADE,
    asset_id            UUID REFERENCES asset (id),
    space_id            UUID REFERENCES space (id),
    title               VARCHAR(160) NOT NULL,
    description         VARCHAR(2000),
    checklist           VARCHAR(4000) NOT NULL DEFAULT '[]',   -- JSON array of strings
    recurrence          VARCHAR(500) NOT NULL,                 -- JSON, see Recurrence
    starts_on           DATE NOT NULL,
    ends_on             DATE,
    lead_days           INT NOT NULL DEFAULT 7,
    assignee_note       VARCHAR(300),
    active              BOOLEAN NOT NULL DEFAULT TRUE,
    paused_reason       VARCHAR(32),
    next_due_on         DATE,
    created_by_user_id  UUID NOT NULL REFERENCES app_user (id),
    created_at          TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at          TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT ck_plan_one_target CHECK ((asset_id IS NULL AND space_id IS NOT NULL)
                                      OR (asset_id IS NOT NULL AND space_id IS NULL)),
    CONSTRAINT ck_plan_lead_days CHECK (lead_days BETWEEN 0 AND 90),
    CONSTRAINT ck_plan_dates CHECK (ends_on IS NULL OR ends_on >= starts_on)
);
CREATE INDEX ix_plan_building ON maintenance_plan (building_id);
CREATE INDEX ix_plan_due ON maintenance_plan (active, next_due_on);

ALTER TABLE issue ADD COLUMN kind VARCHAR(16) NOT NULL DEFAULT 'REPORTED';
ALTER TABLE issue ADD COLUMN maintenance_plan_id UUID;
ALTER TABLE issue ADD COLUMN due_on DATE;
ALTER TABLE issue ADD COLUMN overdue_notified_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE issue ADD CONSTRAINT fk_issue_plan
    FOREIGN KEY (maintenance_plan_id) REFERENCES maintenance_plan (id) ON DELETE SET NULL;
ALTER TABLE issue ADD CONSTRAINT ck_issue_kind CHECK (kind IN ('REPORTED', 'SCHEDULED'));
-- Scheduled tasks carry no catalog problem or free text of their own.
ALTER TABLE issue DROP CONSTRAINT ck_issue_problem;
ALTER TABLE issue ADD CONSTRAINT ck_issue_problem
    CHECK (kind = 'SCHEDULED' OR problem_type_id IS NOT NULL OR other_text IS NOT NULL);
-- One task per plan and due date: generation is idempotent.
CREATE UNIQUE INDEX uk_issue_plan_due ON issue (maintenance_plan_id, due_on);

INSERT INTO permission_policy (governance_mode, action, role_code, scope) VALUES
    ('MANAGED', 'MAINTENANCE_VIEW',   'ADMIN',   'ANY'),
    ('MANAGED', 'MAINTENANCE_VIEW',   'MANAGER', 'ANY'),
    ('MANAGED', 'MAINTENANCE_VIEW',   'OWNER',   'ANY'),
    ('MANAGED', 'MAINTENANCE_VIEW',   'TENANT',  'ANY'),
    ('MANAGED', 'MAINTENANCE_MANAGE', 'ADMIN',   'ANY'),
    ('MANAGED', 'MAINTENANCE_MANAGE', 'MANAGER', 'ANY'),
    ('OPEN',    'MAINTENANCE_VIEW',   'ADMIN',   'ANY'),
    ('OPEN',    'MAINTENANCE_VIEW',   'MANAGER', 'ANY'),
    ('OPEN',    'MAINTENANCE_VIEW',   'OWNER',   'ANY'),
    ('OPEN',    'MAINTENANCE_VIEW',   'TENANT',  'ANY'),
    ('OPEN',    'MAINTENANCE_MANAGE', 'ADMIN',   'ANY'),
    ('OPEN',    'MAINTENANCE_MANAGE', 'MANAGER', 'ANY'),
    ('OPEN',    'MAINTENANCE_MANAGE', 'OWNER',   'ANY');

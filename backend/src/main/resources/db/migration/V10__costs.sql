-- Phase 6: cost tracking (tracking only — no per-unit splitting).

CREATE TABLE cost_entry (
    id                    UUID PRIMARY KEY,
    version               BIGINT NOT NULL DEFAULT 0,
    building_id           UUID NOT NULL REFERENCES building (id) ON DELETE CASCADE,
    -- Every amount carries its own currency; NUMERIC(19,4) fits any ISO 4217 minor unit.
    amount                NUMERIC(19, 4) NOT NULL,
    currency              VARCHAR(3) NOT NULL,
    incurred_on           DATE NOT NULL,
    category              VARCHAR(32) NOT NULL,
    description           VARCHAR(500) NOT NULL,
    vendor                VARCHAR(160),
    issue_id              UUID REFERENCES issue (id) ON DELETE SET NULL,
    maintenance_plan_id   UUID REFERENCES maintenance_plan (id) ON DELETE SET NULL,
    asset_id              UUID REFERENCES asset (id),
    space_id              UUID REFERENCES space (id) ON DELETE SET NULL,
    receipt_storage_key   VARCHAR(255),
    receipt_content_type  VARCHAR(64),
    created_by_user_id    UUID NOT NULL REFERENCES app_user (id),
    created_at            TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at            TIMESTAMP WITH TIME ZONE NOT NULL,
    deleted_at            TIMESTAMP WITH TIME ZONE,
    delete_reason         VARCHAR(300),
    CONSTRAINT ck_cost_amount CHECK (amount > 0),
    CONSTRAINT ck_cost_category CHECK (category IN ('REPAIR', 'MAINTENANCE', 'CLEANING', 'UTILITIES', 'INSURANCE', 'OTHER'))
);
CREATE INDEX ix_cost_building_date ON cost_entry (building_id, incurred_on);
CREATE INDEX ix_cost_issue ON cost_entry (issue_id);
CREATE INDEX ix_cost_asset ON cost_entry (asset_id);

-- Owners see costs in Managed buildings (they pay for the building); tenants don't by default.
INSERT INTO permission_policy (governance_mode, action, role_code, scope) VALUES
    ('MANAGED', 'COST_VIEW',   'ADMIN',   'ANY'),
    ('MANAGED', 'COST_VIEW',   'MANAGER', 'ANY'),
    ('MANAGED', 'COST_VIEW',   'OWNER',   'ANY'),
    ('MANAGED', 'COST_MANAGE', 'ADMIN',   'ANY'),
    ('MANAGED', 'COST_MANAGE', 'MANAGER', 'ANY'),
    ('OPEN',    'COST_VIEW',   'ADMIN',   'ANY'),
    ('OPEN',    'COST_VIEW',   'MANAGER', 'ANY'),
    ('OPEN',    'COST_VIEW',   'OWNER',   'ANY'),
    ('OPEN',    'COST_VIEW',   'TENANT',  'ANY'),
    ('OPEN',    'COST_MANAGE', 'ADMIN',   'ANY'),
    ('OPEN',    'COST_MANAGE', 'MANAGER', 'ANY'),
    ('OPEN',    'COST_MANAGE', 'OWNER',   'ANY');

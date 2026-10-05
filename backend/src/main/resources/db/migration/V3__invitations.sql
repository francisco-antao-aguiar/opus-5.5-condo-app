-- Phase 2: invitations and membership provenance.

CREATE TABLE invitation (
    id                       UUID PRIMARY KEY,
    version                  BIGINT NOT NULL DEFAULT 0,
    building_id              UUID NOT NULL REFERENCES building (id) ON DELETE CASCADE,
    code                     VARCHAR(16) NOT NULL,
    role_code                VARCHAR(32) NOT NULL REFERENCES role (code),
    -- An invitation into a unit is meaningless once the unit is gone.
    unit_space_id            UUID REFERENCES space (id) ON DELETE CASCADE,
    created_by_membership_id UUID NOT NULL REFERENCES membership (id) ON DELETE CASCADE,
    max_uses                 INT NOT NULL,
    use_count                INT NOT NULL DEFAULT 0,
    expires_at               TIMESTAMP WITH TIME ZONE NOT NULL,
    membership_expires_at    TIMESTAMP WITH TIME ZONE,
    note                     VARCHAR(200),
    revoked_at               TIMESTAMP WITH TIME ZONE,
    created_at               TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at               TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT uk_invitation_code UNIQUE (code),
    CONSTRAINT ck_invitation_uses CHECK (max_uses >= 1 AND use_count >= 0 AND use_count <= max_uses)
);
CREATE INDEX ix_invitation_building ON invitation (building_id);

ALTER TABLE membership ADD COLUMN invitation_id UUID;
ALTER TABLE membership ADD COLUMN invited_by_user_id UUID;
ALTER TABLE membership ADD CONSTRAINT fk_membership_invitation
    FOREIGN KEY (invitation_id) REFERENCES invitation (id) ON DELETE SET NULL;
ALTER TABLE membership ADD CONSTRAINT fk_membership_invited_by
    FOREIGN KEY (invited_by_user_id) REFERENCES app_user (id) ON DELETE SET NULL;

-- Supports the expiry job's scan.
CREATE INDEX ix_membership_status_expires ON membership (status, expires_at);

-- Membership end can be relative to acceptance (e.g. a 7-day guest) instead of a fixed date. Never both.
ALTER TABLE invitation ADD COLUMN membership_duration_days INT;
ALTER TABLE invitation ADD CONSTRAINT ck_invitation_membership_end CHECK (
    (membership_duration_days IS NULL OR membership_duration_days BETWEEN 1 AND 3650)
    AND (membership_expires_at IS NULL OR membership_duration_days IS NULL)
);

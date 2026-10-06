-- Phase 6: local time (schedules, opening hours) and the default currency for costs.
ALTER TABLE building ADD COLUMN time_zone VARCHAR(64) NOT NULL DEFAULT 'Europe/Lisbon';
-- Only a default for new cost entries: every amount stores its own currency.
ALTER TABLE building ADD COLUMN currency VARCHAR(3) NOT NULL DEFAULT 'EUR';

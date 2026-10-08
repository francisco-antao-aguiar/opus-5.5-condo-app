-- Scheduled tasks keep their own copy of the plan's checklist (editing the plan doesn't rewrite past tasks)
-- and which items were ticked, by whom and when.
ALTER TABLE issue ADD COLUMN checklist VARCHAR(8000) NOT NULL DEFAULT '[]';        -- JSON array of strings
ALTER TABLE issue ADD COLUMN checklist_done VARCHAR(8000) NOT NULL DEFAULT '[]';   -- JSON array of {index, by, at}

UPDATE issue SET checklist = (SELECT p.checklist FROM maintenance_plan p WHERE p.id = issue.maintenance_plan_id)
WHERE kind = 'SCHEDULED'
  AND maintenance_plan_id IS NOT NULL;

-- Part of what a calendar feed link signs: rotating it revokes every link handed out before.
ALTER TABLE app_user ADD COLUMN calendar_key VARCHAR(32);

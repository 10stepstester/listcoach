-- Phase 1: capacity-matched nudge system — additive only, idempotent.
-- Re-runnable: every ADD COLUMN uses IF NOT EXISTS, so applying twice is a no-op.

-- subtasks: per-to-do capacity tags. The morning advisory (generatePlan) assigns
-- these onto the LEAF to-dos, not the project-header parents.
ALTER TABLE subtasks ADD COLUMN IF NOT EXISTS est_minutes INT;                       -- rough size estimate; NULL = untriaged
ALTER TABLE subtasks ADD COLUMN IF NOT EXISTS lane TEXT CHECK (lane IN ('practice', 'dev'));
ALTER TABLE subtasks ADD COLUMN IF NOT EXISTS priority INT;                           -- lower = more important; NULL = untriaged
ALTER TABLE subtasks ADD COLUMN IF NOT EXISTS is_emergency BOOLEAN NOT NULL DEFAULT false;

-- daily_advisory: the advisory now produces an ordered, capacity-tagged queue plus
-- the day's shape. recommended_focus / nudge_guidance stay for backward compat.
ALTER TABLE daily_advisory ADD COLUMN IF NOT EXISTS plan_queue JSONB;                 -- ordered [{subtask_id, lane, est_minutes, priority, is_emergency}]
ALTER TABLE daily_advisory ADD COLUMN IF NOT EXISTS day_type TEXT;                    -- e.g. 'full' | 'normal' from clinic-day density

-- users: clinic hours. These are BLACKOUT windows carved out of the existing
-- active_hours_start..active_hours_end nudge window — i.e. "I can be nudged during
-- active hours EXCEPT when I'm with patients." clinic_days uses ISO day-of-week
-- numbering: 1=Mon, 2=Tue, ... 7=Sun. Default '1,2,3,4' = Mon–Thu.
ALTER TABLE users ADD COLUMN IF NOT EXISTS clinic_days TEXT NOT NULL DEFAULT '1,2,3,4';
ALTER TABLE users ADD COLUMN IF NOT EXISTS clinic_start TIME NOT NULL DEFAULT '08:00';
ALTER TABLE users ADD COLUMN IF NOT EXISTS clinic_end TIME NOT NULL DEFAULT '18:00';

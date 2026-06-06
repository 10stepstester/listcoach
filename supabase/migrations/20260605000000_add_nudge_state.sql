-- Attention choreographer: the "task in flight" (Phase 3 of the spec).
-- Tracks the ONE task being walked through prime → go → check at any moment, so
-- follow-up beats ("you text Janet yet?") and reply-driven changes have continuity.
-- Additive, idempotent.

CREATE TABLE IF NOT EXISTS nudge_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lane TEXT,                                  -- 'reactivation' | 'practice' | 'dev'
  task_label TEXT NOT NULL,                   -- short human label, e.g. "Text Janet Gose"
  entity JSONB,                               -- {patient_id,name,phone} or {subtask_id}, etc.
  beat_stage TEXT NOT NULL DEFAULT 'assigned', -- primed | assigned | checking | done | dropped
  beats_sent INT NOT NULL DEFAULT 0,          -- nudges sent for this task (drives escalation/give-up)
  assigned_at TIMESTAMPTZ DEFAULT now(),
  last_beat_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Fast lookup of the current in-flight task (non-terminal stages) per user.
CREATE INDEX IF NOT EXISTS idx_nudge_state_user_stage
  ON nudge_state(user_id, beat_stage, created_at DESC);

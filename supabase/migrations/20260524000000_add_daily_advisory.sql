CREATE TABLE IF NOT EXISTS daily_advisory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  sprint_snapshot JSONB,
  yesterday_activity JSONB,
  advisor_transcript JSONB,
  recommended_focus TEXT,
  nudge_guidance TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, date)
);
CREATE INDEX IF NOT EXISTS idx_daily_advisory_user_date ON daily_advisory(user_id, date DESC);

-- Editable strategy playbooks. Lets Ladd edit the dev plan (v4), the practice
-- cadence, and amendments from Settings — the choreographer reads these at runtime
-- and falls back to the code constants when a key isn't set. Additive, idempotent.
CREATE TABLE IF NOT EXISTS plan_docs (
  key TEXT PRIMARY KEY,        -- 'v4' | 'practice' | 'amendments'
  content TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

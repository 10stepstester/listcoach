-- v5 DEV/OPS lane model: allow 'ops' on subtasks.lane.
-- Additive — drops + re-adds ONLY the CHECK constraint; the column and its data are
-- preserved. (subtasks.lane is currently inert; the live choreographer writes
-- nudge_state.lane, which is plain TEXT with no constraint and already accepts 'ops'.)
ALTER TABLE subtasks DROP CONSTRAINT IF EXISTS subtasks_lane_check;
ALTER TABLE subtasks ADD CONSTRAINT subtasks_lane_check CHECK (lane IN ('practice', 'dev', 'ops'));

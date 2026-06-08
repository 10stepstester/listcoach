// =============================================================================
// nudge-state.ts — the "task in flight" (Phase 3).
// =============================================================================
// At most one task is in flight per user at a time. The choreographer brain reads
// the active task each tick to decide whether to continue its lifecycle
// (prime → go → check, escalate, or advance on a reply) or pick a fresh one.
// =============================================================================
import { supabase } from '@/lib/db';

export type BeatStage = 'primed' | 'assigned' | 'checking' | 'done' | 'dropped';
// v5 lanes: reactivation (clinic cash) · ops (business marketing/admin/content) · dev
// (software builds). Legacy 'practice' rows are normalized to 'ops' on read.
export type TaskLane = 'reactivation' | 'ops' | 'dev';

const ACTIVE_STAGES: BeatStage[] = ['primed', 'assigned', 'checking'];

export interface NudgeTask {
  id: string;
  user_id: string;
  lane: TaskLane | null;
  task_label: string;
  entity: Record<string, unknown> | null;
  beat_stage: BeatStage;
  beats_sent: number;
  assigned_at: string;
  last_beat_at: string | null;
  updated_at: string;
  created_at: string;
}

// The current in-flight task (most recent non-terminal row), or null.
export async function getActiveTask(userId: string): Promise<NudgeTask | null> {
  const { data, error } = await supabase
    .from('nudge_state')
    .select('*')
    .eq('user_id', userId)
    .in('beat_stage', ACTIVE_STAGES)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error('[nudge-state] getActiveTask error:', error);
    return null;
  }
  const task = (data as NudgeTask) ?? null;
  if (task && (task.lane as unknown as string) === 'practice') task.lane = 'ops'; // legacy → ops
  return task;
}

// Start a new in-flight task. Drops any existing active task first so only one is
// ever in flight.
export async function startTask(
  userId: string,
  task: {
    lane?: TaskLane | null;
    task_label: string;
    entity?: Record<string, unknown> | null;
    beat_stage?: BeatStage;
  }
): Promise<NudgeTask | null> {
  await dropActiveTasks(userId);
  const { data, error } = await supabase
    .from('nudge_state')
    .insert({
      user_id: userId,
      lane: task.lane ?? null,
      task_label: task.task_label,
      entity: task.entity ?? null,
      beat_stage: task.beat_stage ?? 'assigned',
    })
    .select()
    .single();
  if (error) {
    console.error('[nudge-state] startTask error:', error);
    return null;
  }
  return data as NudgeTask;
}

// Record that a beat (text) was just sent: bump beats_sent, stamp last_beat_at,
// optionally advance the stage. (Single 10-min cron per user → no real race on the
// read-then-write increment.)
export async function recordBeat(id: string, opts: { stage?: BeatStage } = {}): Promise<void> {
  const { data } = await supabase.from('nudge_state').select('beats_sent').eq('id', id).single();
  const nowIso = new Date().toISOString();
  const patch: Record<string, unknown> = {
    beats_sent: (data?.beats_sent ?? 0) + 1,
    last_beat_at: nowIso,
    updated_at: nowIso,
  };
  if (opts.stage) patch.beat_stage = opts.stage;
  const { error } = await supabase.from('nudge_state').update(patch).eq('id', id);
  if (error) console.error('[nudge-state] recordBeat error:', error);
}

// Update the task's shape when a reply reshapes it (e.g. "call first" → relabel).
export async function updateTask(
  id: string,
  fields: Partial<Pick<NudgeTask, 'lane' | 'task_label' | 'entity' | 'beat_stage'>>
): Promise<void> {
  const { error } = await supabase
    .from('nudge_state')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) console.error('[nudge-state] updateTask error:', error);
}

// Close the current task. done = completed; dropped = abandoned/superseded.
export async function closeTask(id: string, status: 'done' | 'dropped'): Promise<void> {
  const { error } = await supabase
    .from('nudge_state')
    .update({ beat_stage: status, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) console.error('[nudge-state] closeTask error:', error);
}

async function dropActiveTasks(userId: string): Promise<void> {
  const { error } = await supabase
    .from('nudge_state')
    .update({ beat_stage: 'dropped', updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .in('beat_stage', ACTIVE_STAGES);
  if (error) console.error('[nudge-state] dropActiveTasks error:', error);
}

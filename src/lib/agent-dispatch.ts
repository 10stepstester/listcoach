// =============================================================================
// agent-dispatch.ts — Phase C: "reply GO and the agent does it".
// =============================================================================
// For dev-lane software tasks the choreographer no longer walks Ladd through
// code edits over SMS (that produced "open package.json. Just open it." x21).
// Instead it OFFERS a cloud coding agent: the nudge carries a self-contained
// brief; Ladd replies GO; the webhook queues the job here (on the nudge_state
// row's entity.dispatch — no new table); a claude.ai cloud trigger polls
// /api/agent/queue every ~30 min, does the work on a branch + PR (never the
// default branch), and POSTs /api/agent/complete, which texts Ladd the result
// and records it in durable memory.
// =============================================================================
import { supabase } from '@/lib/db';
import { closeTask, updateTask, type NudgeTask } from '@/lib/nudge-state';
import { appendFacts } from '@/lib/plan-store';

// chatwithmybody lives in the nativehelix repo (product renamed, repo not).
export const AGENT_REPO = 'https://github.com/10stepstester/nativehelix';
export const AGENT_REPO_DEFAULT_BRANCH = 'master';

export type DispatchStatus = 'offered' | 'queued' | 'running' | 'done' | 'failed' | 'blocked';

export interface DispatchInfo {
  status: DispatchStatus;
  brief: string;
  repo: string;
  offered_at?: string;
  queued_at?: string;
  started_at?: string;
  finished_at?: string;
  summary?: string;
  pr_url?: string;
}

export function getDispatch(task: NudgeTask | null): DispatchInfo | null {
  const d = task?.entity?.dispatch;
  if (!d || typeof d !== 'object') return null;
  return d as unknown as DispatchInfo;
}

// Deterministic GO detection — no model call between "GO" and the queue.
const GO_RE = /^\s*(go|go ahead|do it|run it|send it|yes,? go|agent,? go|you do it|🤖)\s*[.!]*\s*$/i;
export function isGoReply(body: string): boolean {
  return GO_RE.test(body);
}

export async function queueDispatch(task: NudgeTask): Promise<DispatchInfo | null> {
  const d = getDispatch(task);
  if (!d || d.status !== 'offered') return null;
  const queued: DispatchInfo = { ...d, status: 'queued', queued_at: new Date().toISOString() };
  await updateTask(task.id, { entity: { ...(task.entity ?? {}), dispatch: queued } });
  return queued;
}

export interface AgentJob {
  taskId: string;
  userId: string;
  label: string;
  brief: string;
  repo: string;
  defaultBranch: string;
  queuedAt: string | null;
}

// Queued jobs for the executor. Marks each returned job 'running' so a second
// poll (or an overlapping run) can't pick the same job up twice.
export async function claimQueuedJobs(): Promise<AgentJob[]> {
  const { data, error } = await supabase
    .from('nudge_state')
    .select('*')
    .in('beat_stage', ['primed', 'assigned', 'checking'])
    .filter('entity->dispatch->>status', 'eq', 'queued');
  if (error) {
    console.error('[agent-dispatch] claimQueuedJobs error:', error);
    return [];
  }

  const jobs: AgentJob[] = [];
  for (const row of (data ?? []) as NudgeTask[]) {
    const d = getDispatch(row);
    if (!d) continue;
    await updateTask(row.id, {
      entity: {
        ...(row.entity ?? {}),
        dispatch: { ...d, status: 'running', started_at: new Date().toISOString() },
      },
    });
    jobs.push({
      taskId: row.id,
      userId: row.user_id,
      label: row.task_label,
      brief: d.brief,
      repo: d.repo || AGENT_REPO,
      defaultBranch: AGENT_REPO_DEFAULT_BRANCH,
      queuedAt: d.queued_at ?? null,
    });
  }
  return jobs;
}

export interface CompletionReport {
  status: 'done' | 'failed' | 'blocked';
  summary: string;
  prUrl?: string;
}

// Record the executor's report: update dispatch state, close the task on done
// (leave it active on failed/blocked so the loop can follow up), write durable
// memory, and return the SMS to send Ladd.
export async function completeDispatch(
  taskId: string,
  report: CompletionReport
): Promise<{ userId: string; sms: string } | null> {
  const { data: row, error } = await supabase
    .from('nudge_state')
    .select('*')
    .eq('id', taskId)
    .single();
  if (error || !row) {
    console.error('[agent-dispatch] completeDispatch: task not found', taskId, error);
    return null;
  }
  const task = row as NudgeTask;
  const d = getDispatch(task);

  await updateTask(taskId, {
    entity: {
      ...(task.entity ?? {}),
      dispatch: {
        ...(d ?? { brief: '', repo: AGENT_REPO }),
        status: report.status,
        summary: report.summary,
        pr_url: report.prUrl,
        finished_at: new Date().toISOString(),
      },
    },
  });

  let sms: string;
  if (report.status === 'done') {
    await closeTask(taskId, 'done');
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date());
    await appendFacts([
      `${today}: Agent completed "${task.task_label}" — ${report.summary}${report.prUrl ? ` (${report.prUrl})` : ''}. Awaiting Ladd's review/merge.`,
    ]);
    sms = `🤖 Done: ${task.task_label}. ${report.summary}${report.prUrl ? `\nReview: ${report.prUrl}` : ''}`;
  } else if (report.status === 'blocked') {
    sms = `🤖 Need input on "${task.task_label}": ${report.summary}`;
  } else {
    sms = `🤖 Couldn't finish "${task.task_label}": ${report.summary}`;
  }
  return { userId: task.user_id, sms };
}

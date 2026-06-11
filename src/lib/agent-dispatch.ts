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

export type DispatchStatus =
  | 'offered'
  | 'queued'
  | 'running'
  | 'awaiting_merge'
  | 'merged'
  | 'failed'
  | 'blocked';

export interface DispatchInfo {
  status: DispatchStatus;
  brief: string;
  repo: string;
  offered_at?: string;
  queued_at?: string;
  started_at?: string;
  finished_at?: string;
  merged_at?: string;
  summary?: string;
  upside?: string;
  risk?: string;
  verdict?: string;
  pr_url?: string;
  pr_number?: number;
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

// Deterministic MERGE detection — his one-word "make it live".
const MERGE_RE = /^\s*(merge|ship( it)?|approve[d]?|make it live|✅)\s*[.!]*\s*$/i;
export function isMergeReply(body: string): boolean {
  return MERGE_RE.test(body);
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
  upside?: string;
  risk?: string;
  verdict?: string;
  prUrl?: string;
  prNumber?: number;
}

// Record the executor's report. "done" means built AND checked (the executor runs
// a review pass + the repo's build before reporting) — the task parks as
// awaiting_merge and Ladd gets one plain-words text: what changed, upside, risk,
// reply MERGE. Nothing is texted with a bare PR link; the link lives on the task
// for the merge call (and for anyone who wants to look).
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

  const status: DispatchStatus = report.status === 'done' ? 'awaiting_merge' : report.status;
  await updateTask(taskId, {
    entity: {
      ...(task.entity ?? {}),
      dispatch: {
        ...(d ?? { brief: '', repo: AGENT_REPO }),
        status,
        summary: report.summary,
        upside: report.upside,
        risk: report.risk,
        verdict: report.verdict,
        pr_url: report.prUrl,
        pr_number: report.prNumber,
        finished_at: new Date().toISOString(),
      },
    },
  });

  let sms: string;
  if (report.status === 'done') {
    sms =
      `🤖 ${task.task_label} — done & checked. ${report.summary}` +
      (report.upside ? `\nUpside: ${report.upside}` : '') +
      (report.risk ? `\nRisk: ${report.risk}` : '') +
      `\nReply MERGE to make it live.`;
  } else if (report.status === 'blocked') {
    sms = `🤖 Need input on "${task.task_label}": ${report.summary}`;
  } else {
    sms = `🤖 Couldn't finish "${task.task_label}": ${report.summary}`;
  }
  return { userId: task.user_id, sms };
}

// Ladd replied MERGE: squash-merge the agent's PR via the GitHub API, close the
// task, and record the real-world change in durable memory. Returns the SMS to
// send (success or a plain failure with the reason).
export async function mergeDispatch(task: NudgeTask): Promise<{ sms: string; merged: boolean }> {
  const d = getDispatch(task);
  if (!d || d.status !== 'awaiting_merge') {
    return { sms: '', merged: false };
  }
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    return { sms: `Can't merge from here yet — GITHUB_TOKEN isn't configured.`, merged: false };
  }

  const repoMatch = (d.repo || '').match(/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/);
  const prNumber = d.pr_number ?? Number((d.pr_url || '').match(/\/pull\/(\d+)/)?.[1]);
  if (!repoMatch || !prNumber) {
    return {
      sms: `🤖 Can't merge "${task.task_label}" — no PR recorded on the job. I'll flag it.`,
      merged: false,
    };
  }

  try {
    const res = await fetch(
      `https://api.github.com/repos/${repoMatch[1]}/${repoMatch[2]}/pulls/${prNumber}/merge`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ merge_method: 'squash' }),
      }
    );
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.merged) {
      const msg = body.message || `HTTP ${res.status}`;
      console.error('[agent-dispatch] merge failed:', msg);
      return { sms: `🤖 Merge didn't go through for "${task.task_label}": ${msg}`, merged: false };
    }
  } catch (err) {
    console.error('[agent-dispatch] merge error:', err);
    return { sms: `🤖 Merge hit an error for "${task.task_label}" — I'll retry next time you reply MERGE.`, merged: false };
  }

  await updateTask(task.id, {
    entity: {
      ...(task.entity ?? {}),
      dispatch: { ...d, status: 'merged', merged_at: new Date().toISOString() },
    },
  });
  await closeTask(task.id, 'done');
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date());
  await appendFacts([
    `${today}: "${task.task_label}" is DONE and merged (agent built it, Ladd approved): ${d.summary ?? ''} Never nudge this again.`,
  ]);
  return { sms: `✅ Merged — "${task.task_label}" will be live in a few minutes.`, merged: true };
}

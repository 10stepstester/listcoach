// =============================================================================
// choreographer.ts — the attention-choreographer brain (Phase 4).
// =============================================================================
// One decision per 10-min tick: read the shape of Ladd's day (calendar) + the
// in-flight task + recent replies + the to-do list + the top reactivation
// candidate, then pick exactly one beat (prime / go / check) and a short text, or
// stay silent. See docs/choreographer-spec.md.
//
// Built as a standalone lib so the cron route stays thin and we can dry-run it.
// =============================================================================
import Anthropic from '@anthropic-ai/sdk';
import { supabase } from '@/lib/db';
import { planWeek } from '@/lib/plan';
import { getActivePlans } from '@/lib/plan-store';
import {
  getCalendarMoment,
  classifyWindow,
  type CalendarMoment,
  type WindowSituation,
} from '@/lib/google-calendar';
import {
  getActiveTask,
  startTask,
  recordBeat,
  closeTask,
  type NudgeTask,
  type TaskLane,
  type BeatStage,
} from '@/lib/nudge-state';
import { sendSMS } from '@/lib/twilio';
import type { Goal, Subtask } from '@/types/index';

const anthropic = new Anthropic();

const COOLDOWN_MIN = 8; // < the 10-min grid, so consecutive beats fire but rapid doubles don't

export interface ChoreographerDecision {
  action: 'send' | 'skip';
  reason: string;
  beat?: 'prime' | 'go' | 'check';
  text?: string;
  lane?: TaskLane;
  taskLabel?: string;
  situation?: WindowSituation;
  dryRun?: boolean;
}

interface ReactivationCandidate {
  id: number;
  name: string;
  phone: string | null;
  days_since_last_visit: number;
}

// --- reactivation candidates from fasciachart --------------------------------
async function getReactivationCandidates(limit = 1): Promise<ReactivationCandidate[]> {
  const url = process.env.FASCIACHART_API_URL;
  const token = process.env.LISTCOACH_SERVICE_TOKEN;
  if (!url || !token) return [];
  try {
    const res = await fetch(`${url}/api/reactivation/top?limit=${limit}`, {
      headers: { 'x-service-token': token },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.patients as ReactivationCandidate[]) ?? [];
  } catch (err) {
    console.error('[choreographer] reactivation fetch failed:', err);
    return [];
  }
}

async function getTopReactivation(): Promise<ReactivationCandidate | null> {
  return (await getReactivationCandidates(1))[0] ?? null;
}

// Tell fasciachart a patient was contacted, so they stop resurfacing as top candidate.
async function logReactivationContact(patientId: number, status = 'sent'): Promise<void> {
  const url = process.env.FASCIACHART_API_URL;
  const token = process.env.LISTCOACH_SERVICE_TOKEN;
  if (!url || !token) return;
  try {
    await fetch(`${url}/api/reactivation/patients/${patientId}/log-contact`, {
      method: 'POST',
      headers: { 'x-service-token': token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
  } catch (err) {
    console.error('[choreographer] log-contact failed:', err);
  }
}

// --- open leaf to-dos (dev/ops/clinic fuel — combined with the playbook stacks) ---
async function getOpenTodos(userId: string): Promise<string[]> {
  const { data: goals } = await supabase
    .from('goals')
    .select('*, subtasks(*)')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('position');
  const all: Subtask[] = (goals || []).flatMap((g: Goal) => g.subtasks || []);
  const byId = new Map(all.map((s) => [s.id, s]));
  const parentIds = new Set(all.filter((s) => s.parent_id).map((s) => s.parent_id));
  const leaves = all.filter((s) => !s.is_completed && !parentIds.has(s.id));
  return leaves.map((s) => {
    const parent = (s.parent_id && byId.get(s.parent_id)?.title) || '(no project)';
    return `${parent} | ${s.title}`;
  });
}

// --- describe the calendar moment in one human sentence ----------------------
function describeSituation(m: CalendarMoment, sit: WindowSituation): string {
  switch (sit) {
    case 'prime':
      return `In a session ("${m.currentTitle ?? 'patient'}") ending in ~${m.minutesUntilSessionEnds} min, then a ${
        m.gapAfterSession == null ? 'long open' : `~${m.gapAfterSession} min`
      } gap opens.`;
    case 'open':
      return `Free right now for ~${m.minutesUntilNextBusy} min until the next session${
        m.nextTitle ? ` ("${m.nextTitle}")` : ''
      }.`;
    case 'wide_open':
      return `Free now with nothing scheduled ahead (evening / weekend / open block).`;
    case 'mid_session':
      return `In a session ("${m.currentTitle ?? 'patient'}"), not ending soon.`;
    default:
      return `No usable window right now.`;
  }
}

// Usable window length + an explicit size directive, so the brain can match task
// size reliably. minutesOverride (used only by dry-run simulation) forces a length.
function windowInfo(
  m: CalendarMoment | null,
  sit: WindowSituation,
  minutesOverride?: number | null
): { minutes: number | null; line: string } {
  let minutes: number | null;
  if (minutesOverride !== undefined) minutes = minutesOverride;
  else if (sit === 'prime') minutes = m?.gapAfterSession ?? null;
  else if (sit === 'open') minutes = m?.minutesUntilNextBusy ?? null;
  else minutes = null; // wide_open / other → open-ended

  const sliver = minutes != null && minutes <= 45;
  if (sit === 'prime') {
    return {
      minutes,
      line: `Wrapping a patient; a ${minutes == null ? 'long open' : `~${minutes} min`} gap opens after — ${
        sliver
          ? 'SLIVER: small OPS/content/reactivation/scoped-DEV only, NO deep build.'
          : 'room for a deeper build.'
      }`,
    };
  }
  if (sliver) {
    return {
      minutes,
      line: `~${minutes} min — SLIVER: a small OPS action, content step, reactivation text, or a tightly-scoped DEV sub-step. NEVER a deep build.`,
    };
  }
  return {
    minutes,
    line: `${minutes == null ? 'Open-ended (evening / weekend / long block)' : `~${minutes} min`} — room for the top DEEP DEV build.`,
  };
}

const CORE_SYSTEM = `You are Ladd's attention choreographer — a real-person accountability texter, NOT an app. Ladd is a solo chiropractor who is ALSO building a software business (chatwithmybody) and a workshop. You watch the shape of his day and walk him through real open windows with ONE short text at a time. He WANTS to be pushed — he asked for this.

PICK EXACTLY ONE BEAT (or stay silent):
- prime: he's about to finish a patient and a gap opens after — tell him what to do "when you finish".
- go: a window is open right NOW — tell him the one thing to do, now.
- check: a task is in flight and he hasn't confirmed done — nudge it again (see BABY STEPS for tone).
- skip: nothing worth saying (slammed, mid-session with a patient, no good task, or it'd be noise). Silence is good and encouraged.

HARD RULES ON THE TEXT:
- As SHORT as possible. Name + action only. No preamble, no day-type, no explaining WHY, no phone numbers. Reading time near-zero.
- Real names ("Text Janet Gose" / "Email Jerry"), never generic ("a lapsed patient").
- Never repeat the previous text verbatim — vary it.
- Naming: always "chatwithmybody". NEVER the old names "nativehelix" OR "chatwithmydna".

BABY STEPS — the most important rule for big tasks:
Never nudge the whole task. The text is the single smallest first PHYSICAL action that starts it — the 2-minute on-ramp (open the file, buy the domain, run one search, list what needs changing, write one line). Momentum comes from STARTING; the NEXT beat gives the next micro-step. Keep "task_label" as the larger task so it's tracked across beats, but make "text" just the next tiny step.
Example: task_label "Rebrand to chatwithmybody" → text "Search the repo for chatwithmydna — just count the files." Next beat → "Got the count? Rename the homepage title first."
This applies to CHECK beats too: if he's stuck or silent, do NOT just demand a status ("what's blocking you?"). Re-offer an EVEN SMALLER step to break the logjam ("Still on the rebrand? Just run: grep chatwithmydna. 30 sec."). Be persistent (squeaky wheel) but ALWAYS hand him a tiny doable thing, never just an interrogation.

THREE LANES — rank ACROSS all three; the best task wins, whatever the lane:
- reactivation — clinic cash: text a lapsed patient (sourced from the clinic system in the input; ~2 min; fits clinic slivers).
- ops — the business's marketing / admin / content: convert beta users to paying, organic content, build the workshop chiro list, legal/admin. Many are SMALL and fit short windows.
- dev — software builds in Claude Code (chatwithmybody first).
Never interrupt a patient mid-session.

SELECTING THE TASK — use the DEV PLAYBOOK's own decision procedure (its §0):
1. Map the current plan week (in NOW) → its phase. Before the plan start (week 0) → treat as Phase 1.
2. If a kill / pivot / downsize trigger (playbook §7) has fired, apply it FIRST.
3. MATCH TASK SIZE TO THE WINDOW (see WINDOW in the input):
   - ≤~45 min sliver (between patients / fragmented morning): a small OPS action, a content step, a reactivation text, or a tightly-scoped DEV sub-step. NEVER a deep build in a small window.
   - Multi-hour / evening / weekend: the top deep DEV build for the phase (chatwithmybody first).
4. Rank ACROSS lanes using the active phase's task stacks (playbook §3). Tie-break: revenue-blocking > launch-blocking > polish.
5. DEADLINE OVERRIDE: anything in the playbook's dated deadlines (§6) that is past-due or due within 7 days jumps to the top.

CANDIDATE POOL (important): nudge from BOTH the OPEN TO-DOS list AND the current phase's task stacks in the DEV PLAYBOOK. If the highest-priority phase task is NOT in the to-do list (e.g. "convert beta cohort"), nudge it ANYWAY as a concrete first action ("Email Jerry re: the founding rate"). The playbook is a first-class task source, not just reference.

CONVERSATION: read recent replies. "call first" / "with a patient" → acknowledge and reshape, don't blindly repeat. If he said it's done, set task_done.

JUNK: if the only candidates are vague fragments ("Mirror", "Test", "Untitled"), skip — a smart picker ignores junk instead of surfacing it.

Output STRICT JSON only:
{ "action": "send"|"skip", "reason": "<short>", "beat": "prime"|"go"|"check", "continue_task": <bool>, "task_done": <bool>, "lane": "reactivation"|"ops"|"dev", "task_label": "<short label e.g. 'Email Jerry re: founding rate'>", "text": "<the SMS — very short>" }
When action is "skip", only "action" and "reason" are required.`;

interface ModelDecision {
  action: 'send' | 'skip';
  reason?: string;
  beat?: 'prime' | 'go' | 'check';
  continue_task?: boolean;
  task_done?: boolean;
  lane?: TaskLane;
  task_label?: string;
  text?: string;
}

export async function runChoreographer(
  userId: string,
  opts: {
    dryRun?: boolean;
    // Dry-run only: simulate a moment to verify window-size matching across scenarios.
    simulate?: { now?: string; situation?: WindowSituation; windowMinutes?: number | null };
  } = {}
): Promise<ChoreographerDecision> {
  const { dryRun = false, simulate } = opts;

  const { data: user } = await supabase.from('users').select('*').eq('id', userId).single();
  if (!user) return { action: 'skip', reason: 'user not found', dryRun };

  const now = simulate?.now ? new Date(simulate.now) : new Date();
  const hhmm = new Intl.DateTimeFormat('en-GB', {
    timeZone: user.timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(now); // "HH:MM"

  // --- gate: active hours ---
  const start = (user.active_hours_start || '05:00').slice(0, 5);
  const end = (user.active_hours_end || '21:00').slice(0, 5);
  if (hhmm < start || hhmm > end) {
    return { action: 'skip', reason: `outside active hours (${hhmm} not in ${start}-${end})`, dryRun };
  }

  // --- gate: cooldown (skipped in dry-run so we can see the decision) ---
  if (!dryRun) {
    const since = new Date(now.getTime() - COOLDOWN_MIN * 60000).toISOString();
    const { data: recent } = await supabase
      .from('sms_conversations')
      .select('id')
      .eq('user_id', userId)
      .eq('direction', 'outbound')
      .gte('sent_at', since)
      .limit(1);
    if (recent && recent.length > 0) {
      return { action: 'skip', reason: `cooldown (<${COOLDOWN_MIN}m since last text)`, dryRun };
    }
  }

  // --- calendar moment + window (simulate.situation skips the live read) ---
  let moment: CalendarMoment | null = null;
  let situation: WindowSituation;
  if (simulate?.situation) {
    situation = simulate.situation;
  } else {
    if (user.google_calendar_token && user.google_calendar_refresh_token) {
      moment = await getCalendarMoment(
        user.google_calendar_token,
        user.google_calendar_refresh_token,
        userId
      );
    }
    situation = moment ? classifyWindow(moment) : 'wide_open';
  }
  const win = windowInfo(moment, situation, simulate?.windowMinutes);

  const active = await getActiveTask(userId);

  // --- hard silence: mid-session or no usable window, and no in-flight task to
  // follow up. (We never interrupt a patient mid-session.) ---
  if ((situation === 'mid_session' || situation === 'no_window') && !active) {
    return { action: 'skip', reason: `silent: ${situation}`, situation, dryRun };
  }
  if (situation === 'mid_session') {
    return { action: 'skip', reason: 'silent: mid_session (no interrupting a patient)', situation, dryRun };
  }

  // --- gather context for the brain ---
  const [reactivation, todos] = await Promise.all([getTopReactivation(), getOpenTodos(userId)]);

  const { data: recentMsgs } = await supabase
    .from('sms_conversations')
    .select('direction, message_text, sent_at')
    .eq('user_id', userId)
    .order('sent_at', { ascending: false })
    .limit(8);
  const convo = (recentMsgs || [])
    .reverse()
    .map((m) => `${m.direction === 'inbound' ? 'Ladd' : 'You'}: ${m.message_text}`)
    .join('\n');

  const todayLocal = new Intl.DateTimeFormat('en-CA', { timeZone: user.timezone }).format(now);
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone: user.timezone, weekday: 'long' }).format(now);

  const userPrompt = `# NOW
${todayLocal} (${weekday}) ${hhmm} — plan week ${planWeek(now)}

# CALENDAR SITUATION (${situation})
${simulate?.situation ? '(simulated)' : moment ? describeSituation(moment, situation) : 'No calendar connected — assume open.'}

# WINDOW (match task size to this)
${win.line}

# TASK IN FLIGHT
${
  active
    ? `label: "${active.task_label}" | lane: ${active.lane} | stage: ${active.beat_stage} | beats_sent: ${active.beats_sent} | last_beat_at: ${active.last_beat_at ?? 'never'}`
    : '(none — pick a fresh one if a beat fits)'
}

# RECENT TEXTS (oldest → newest)
${convo || '(none)'}

# TOP REACTIVATION CANDIDATE (from the clinic system)
${reactivation ? `${reactivation.name} — ${reactivation.days_since_last_visit} days lapsed${reactivation.phone ? '' : ' (no phone on file)'}` : '(none available)'}

# OPEN TO-DOS (project | title)
${todos.length ? todos.slice(0, 50).join('\n') : '(none)'}
(Also nudge-able: the highest task in the current phase's DEV/OPS stacks from the playbook, even if not in this list — e.g. "Email Jerry re: founding rate".)

Decide the one beat (or skip). Output the JSON now.`;

  const plans = await getActivePlans();

  let decision: ModelDecision;
  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 400,
      system: [
        { type: 'text', text: CORE_SYSTEM },
        {
          type: 'text',
          text: `# DEV PLAYBOOK (rank dev items by this; chatwithmybody first)\n${plans.v4}\n\n# AMENDMENTS\n${plans.amendments}\n\n# PRACTICE PLAYBOOK\n${plans.practice}`,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [{ role: 'user', content: userPrompt }],
    });
    const textBlock = response.content.find((b) => b.type === 'text');
    let raw = textBlock && 'text' in textBlock ? textBlock.text.trim() : '{}';
    raw = raw.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
    decision = JSON.parse(raw) as ModelDecision;
  } catch (err) {
    console.error('[choreographer] model call/parse failed:', err);
    return { action: 'skip', reason: 'model error', situation, dryRun };
  }

  if (decision.action !== 'send' || !decision.text) {
    return { action: 'skip', reason: decision.reason || 'model chose silence', situation, dryRun };
  }

  const beat = decision.beat || 'go';
  const lane = decision.lane;
  const label = decision.task_label || decision.text;

  const result: ChoreographerDecision = {
    action: 'send',
    reason: decision.reason || beat,
    beat,
    text: decision.text,
    lane,
    taskLabel: label,
    situation,
    dryRun,
  };

  if (dryRun) return result;

  // --- execute: send SMS, log, update in-flight state ---
  await sendSMS(user.phone_number, decision.text);
  await supabase
    .from('sms_conversations')
    .insert({ user_id: userId, direction: 'outbound', message_text: decision.text, goal_context: null });

  // Stage mapping: prime → primed, go → assigned, check → checking.
  const stage: BeatStage = beat === 'prime' ? 'primed' : beat === 'check' ? 'checking' : 'assigned';

  if (decision.task_done && active) {
    await closeTask(active.id, 'done');
  }
  if (active && decision.continue_task && !decision.task_done) {
    await recordBeat(active.id, { stage });
  } else if (!decision.task_done) {
    // Attach the patient identity to reactivation tasks so a "done" reply can log
    // the contact back to fasciachart and stop the patient resurfacing.
    const entity =
      lane === 'reactivation' && reactivation
        ? { patient_id: reactivation.id, name: reactivation.name, phone: reactivation.phone }
        : null;
    await startTask(userId, { lane: lane ?? null, task_label: label, entity, beat_stage: stage });
  }

  return result;
}

// =============================================================================
// Reactivity (Phase 5): interpret a reply to the in-flight task and adapt.
// Called from the SMS webhook when an active task exists. Returns the instant ack
// to send, or null if the reply isn't about the task (fall through to list handling).
// =============================================================================
const REPLY_SYSTEM = `You interpret Ladd's SMS reply to a nudge about the task in flight, and write a SHORT acknowledgment that keeps momentum. You're a real-person accountability texter, not an app.

Classify what his reply means about the in-flight task:
- done: he did it / completed it.
- deferred: he'll do it but is doing something else first ("call first", "in a sec").
- declined: he can't / won't right now ("with a patient", "no", "later").
- unrelated: the reply isn't about this task at all.

Write a short ack:
- done: celebrate in ~3 words AND, if a next item is given, hand it to him ("Nice — next is George Ruiz.").
- deferred: acknowledge the detour and re-point ("Cool — then text Janet.").
- declined: brief, no guilt ("All good. Later.").
- unrelated: leave ack empty.

Rules: VERY short. No preamble. Real names. Don't parrot his words.

Output strict JSON: { "meaning": "done"|"deferred"|"declined"|"unrelated", "ack": "<short text or empty>" }`;

export async function handleNudgeReply(
  userId: string,
  active: NudgeTask,
  incoming: string,
  convo: string
): Promise<string | null> {
  const currentPid =
    active.entity && active.entity.patient_id != null ? Number(active.entity.patient_id) : null;

  // For reactivation, fetch the next candidate so the ack can name it on "done".
  let nextCandidate: ReactivationCandidate | null = null;
  if (active.lane === 'reactivation') {
    const cands = await getReactivationCandidates(2);
    nextCandidate = cands.find((c) => c.id !== currentPid) ?? null;
  }

  let parsed: { meaning?: string; ack?: string };
  try {
    const resp = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 150,
      system: REPLY_SYSTEM,
      messages: [
        {
          role: 'user',
          content: `# TASK IN FLIGHT
"${active.task_label}" (lane: ${active.lane}, stage: ${active.beat_stage})

# RECENT TEXTS
${convo || '(none)'}

# HIS REPLY
"${incoming}"

# NEXT REACTIVATION CANDIDATE (only relevant if done + reactivation)
${nextCandidate ? nextCandidate.name : '(none)'}

Output the JSON.`,
        },
      ],
    });
    const tb = resp.content.find((b) => b.type === 'text');
    let raw = tb && 'text' in tb ? tb.text.trim() : '{}';
    raw = raw.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
    parsed = JSON.parse(raw);
  } catch (err) {
    console.error('[choreographer] reply interpret failed:', err);
    return null;
  }

  if (parsed.meaning === 'unrelated') return null; // let the list handler take it

  if (parsed.meaning === 'done') {
    if (active.lane === 'reactivation' && currentPid != null) {
      await logReactivationContact(currentPid, 'sent');
    }
    await closeTask(active.id, 'done');
    // Tee up the next reactivation patient as the new in-flight task.
    if (active.lane === 'reactivation' && nextCandidate) {
      await startTask(userId, {
        lane: 'reactivation',
        task_label: `Text ${nextCandidate.name}`,
        entity: { patient_id: nextCandidate.id, name: nextCandidate.name, phone: nextCandidate.phone },
        beat_stage: 'assigned',
      });
    }
  } else if (parsed.meaning === 'declined') {
    await closeTask(active.id, 'dropped');
  }
  // deferred / other: leave the task active — the next grid tick re-checks, reading
  // this reply for context.

  return parsed.ack || null;
}

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
import { PLAN_V4, PLAN_AMENDMENTS, PLAN_PRACTICE, planWeek } from '@/lib/plan';
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

// --- top reactivation candidate from fasciachart -----------------------------
async function getTopReactivation(): Promise<ReactivationCandidate | null> {
  const url = process.env.FASCIACHART_API_URL;
  const token = process.env.LISTCOACH_SERVICE_TOKEN;
  if (!url || !token) return null;
  try {
    const res = await fetch(`${url}/api/reactivation/top?limit=1`, {
      headers: { 'x-service-token': token },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.patients?.[0] ?? null;
  } catch (err) {
    console.error('[choreographer] reactivation fetch failed:', err);
    return null;
  }
}

// --- open leaf to-dos (the dev/practice fuel) --------------------------------
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

const CORE_SYSTEM = `You are Ladd's attention choreographer — a real-person accountability texter, NOT an app. Ladd is a solo chiropractor who also builds software. You watch the shape of his day and walk him through real open windows with ONE short text at a time. He WANTS to be pushed — he asked for this.

PICK EXACTLY ONE BEAT (or stay silent):
- prime: he's about to finish a patient and a gap opens after — tell him what to do "when you finish".
- go: a window is open right NOW — tell him the one thing to do, now.
- check: you already assigned something and he hasn't confirmed done — ask if it's done; escalate tone if he's gone quiet ("Composing it?" → "What's going on — done?").
- skip: nothing worth saying (slammed, no good task, or it'd be noise). Silence is good and encouraged.

HARD RULES ON THE TEXT:
- As SHORT as possible. Name + action only. No preamble, no day-type ("clinic day"), no explaining WHY, no phone numbers. Reading time near-zero.
- Real names ("Text Janet Gose"), never generic ("a lapsed patient").
- Never repeat the previous text verbatim — vary it.

WHAT FITS WHEN:
- Clinic gap (short window between patients): ONLY quick PRACTICE sips — a reactivation text (~2 min = one sitting), a quick photo. NEVER dev work in a clinic gap.
- Evening / weekend / wide-open: DEV blocks allowed. Rank dev by the dev playbook — chatwithmybody items FIRST. Use the name "chatwithmybody", never the old name "nativehelix".
- Practice ranks by the practice playbook (reactivation first).

CONVERSATION: read recent replies. "call first" / "with a patient" → acknowledge and reshape, don't blindly repeat. If he said it's done, set task_done.

JUNK: if the only candidates are vague fragments ("Mirror", "Test", "Untitled"), skip — a smart picker ignores junk instead of surfacing it.

Output STRICT JSON only:
{ "action": "send"|"skip", "reason": "<short>", "beat": "prime"|"go"|"check", "continue_task": <bool>, "task_done": <bool>, "lane": "reactivation"|"practice"|"dev", "task_label": "<short label e.g. 'Text Janet Gose'>", "text": "<the SMS — very short>" }
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
  opts: { dryRun?: boolean } = {}
): Promise<ChoreographerDecision> {
  const { dryRun = false } = opts;

  const { data: user } = await supabase.from('users').select('*').eq('id', userId).single();
  if (!user) return { action: 'skip', reason: 'user not found', dryRun };

  const now = new Date();
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

  // --- calendar moment + window ---
  let moment: CalendarMoment | null = null;
  if (user.google_calendar_token && user.google_calendar_refresh_token) {
    moment = await getCalendarMoment(
      user.google_calendar_token,
      user.google_calendar_refresh_token,
      userId
    );
  }
  const situation: WindowSituation = moment ? classifyWindow(moment) : 'wide_open';

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
${moment ? describeSituation(moment, situation) : 'No calendar connected — assume open.'}

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

Decide the one beat (or skip). Output the JSON now.`;

  let decision: ModelDecision;
  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 400,
      system: [
        { type: 'text', text: CORE_SYSTEM },
        {
          type: 'text',
          text: `# DEV PLAYBOOK (rank dev items by this; chatwithmybody first)\n${PLAN_V4}\n\n# AMENDMENTS\n${PLAN_AMENDMENTS}\n\n# PRACTICE PLAYBOOK\n${PLAN_PRACTICE}`,
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
    await startTask(userId, {
      lane: lane ?? null,
      task_label: label,
      entity: null,
      beat_stage: stage,
    });
  }

  return result;
}

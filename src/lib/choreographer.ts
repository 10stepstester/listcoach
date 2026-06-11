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
  updateTask,
  closeTask,
  type NudgeTask,
  type TaskLane,
  type BeatStage,
} from '@/lib/nudge-state';
import { sendSMS } from '@/lib/twilio';
import { getDispatch, AGENT_REPO } from '@/lib/agent-dispatch';
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
  agentBrief?: string;
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
    case 'turnover':
      return `Between patients — just wrapped one, next${
        m.nextTitle ? ` ("${m.nextTitle}")` : ''
      } in ~${m.minutesUntilNextBusy} min. Clinic turnover, not a work window.`;
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
  else if (sit === 'open' || sit === 'turnover') minutes = m?.minutesUntilNextBusy ?? null;
  else minutes = null; // wide_open / other → open-ended

  if (sit === 'turnover') {
    return {
      minutes,
      line: `CLINIC TURNOVER — between patients, next one in ~${
        minutes == null ? 'a few' : minutes
      } min. At most ONE quick reactivation/check-in text (~2 min). NO dev/ops/build nudges — he's running his clinic. If you have no good reactivation text, SKIP.`,
    };
  }

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

GROUNDING — KNOWN FACTS are durable truth:
The KNOWN FACTS block is permanent memory built from Ladd's own replies. Trust it over the playbook, the to-do list, and your own assumptions. NEVER nudge anything it marks as already done, owned, or decided — suggesting something he told you is done destroys trust in one text. If facts and playbook conflict, facts win.

AGENT DISPATCH — dev software tasks go to the cloud agent, not to Ladd's thumbs:
You have a cloud coding agent that can do repo work itself (branch + PR for Ladd's review). NEVER walk Ladd through code edits over SMS — no "open the file", "run grep", "paste the output" texts. That failed badly. For a dev-lane task that is concrete software work (renames, code changes, config, a page, a route):
- The text OFFERS the agent and gives a PLAIN-ENGLISH heads-up of what will actually happen — one sentence a non-programmer instantly gets. Describe the OUTCOME in everyday words, never the method. BANNED in the text: repo, branch, PR, commit, merge, search/replace, grep, refactor, config, deploy. Say "the app", "every place that still says X", "you check it before anything goes live". ("Open window. I can do the rebrand: every place the app still says chatwithmydna becomes chatwithmybody. Nothing changes for users until you OK it. GO?")
- Include "agent_brief" in the JSON: a self-contained spec for the agent — what to change, definition of done, what NOT to touch. The agent has the repo and its CLAUDE.md; the brief is the task spec, not repo orientation. The brief can be technical; the TEXT must not be.
- TASK IN FLIGHT shows the dispatch state. offered → a check beat may re-offer briefly ("Rebrand offer still open — GO when ready."), still with agent_brief. queued/running → the agent is on it: do NOT nudge that task; pick a different lane or skip.
- Dev work that genuinely needs Ladd's hands (a registrar/DNS dashboard, buying something, an account approval, a judgment decision) is NOT dispatchable — nudge it as a normal tiny action, no agent_brief.

BABY STEPS — the most important rule for big NON-DEV tasks:
Never nudge the whole task. The text is the single smallest first PHYSICAL action that starts it — the 2-minute on-ramp (draft one line, find one contact, send one email). Momentum comes from STARTING; the NEXT beat gives the next micro-step. Keep "task_label" as the larger task so it's tracked across beats, but make "text" just the next tiny step.
The TASK IN FLIGHT block shows the current micro-step and the last one he completed — hand the NEXT step forward from there; never re-nudge a step he already confirmed.
This applies to CHECK beats too: if he's stuck or silent, do NOT just demand a status ("what's blocking you?"). Re-offer an EVEN SMALLER step to break the logjam. Be persistent (squeaky wheel) but ALWAYS hand him a tiny doable thing, never just an interrogation. (Dev software tasks: see AGENT DISPATCH instead — offer the agent, don't micro-step him through code.)

THREE LANES — rank ACROSS all three; the best task wins, whatever the lane:
- reactivation — clinic cash: text a lapsed patient (sourced from the clinic system in the input; ~2 min; fits clinic slivers).
- ops — the business's marketing / admin / content: convert beta users to paying, organic content, build the workshop chiro list, legal/admin. Many are SMALL and fit short windows.
- dev — software builds in Claude Code (chatwithmybody first).
Never interrupt a patient mid-session.

CLINIC TURNOVER (read the WINDOW): when the window says he's between patients (turnover), he is still running his clinic — the gap is changeover time, not a work window. The ONLY acceptable nudge is a single ~2-min reactivation/check-in text. NO dev, NO ops, NO build steps — do not ping him about software while he's seeing patients. If there's no good reactivation text to send, SKIP.

SELECTING THE TASK — use the DEV PLAYBOOK's own decision procedure (its §0):
1. Map the current plan week (in NOW) → its phase. Before the plan start (week 0) → treat as Phase 1.
2. If a kill / pivot / downsize trigger (playbook §7) has fired, apply it FIRST.
3. MATCH TASK SIZE TO THE WINDOW (see WINDOW in the input):
   - ≤~45 min sliver (between patients / fragmented morning): a small OPS action, a content step, a reactivation text, or a tightly-scoped DEV sub-step. NEVER a deep build in a small window.
   - Multi-hour / evening / weekend: the top deep DEV build for the phase (chatwithmybody first).
4. Rank ACROSS lanes using the active phase's task stacks (playbook §3). Tie-break: revenue-blocking > launch-blocking > polish.
5. DEADLINE OVERRIDE: anything in the playbook's dated deadlines (§6) that is past-due or due within 7 days jumps to the top.

CANDIDATE POOL (important): nudge from BOTH the OPEN TO-DOS list AND the current phase's task stacks in the DEV PLAYBOOK. If the highest-priority phase task is NOT in the to-do list (e.g. "convert beta cohort"), nudge it ANYWAY as a concrete first action ("Email Jerry re: the founding rate"). The playbook is a first-class task source, not just reference.

CONVERSATION: read recent replies. "call first" / "with a patient" → acknowledge and reshape, don't blindly repeat. task_done means the WHOLE task_label is finished — a "yes" to one micro-step is progress, NOT task_done; keep continue_task true and hand the next step. Only set task_done when his words clearly cover the full label (or the label is itself one atomic action he confirmed).

JUNK: if the only candidates are vague fragments ("Mirror", "Test", "Untitled"), skip — a smart picker ignores junk instead of surfacing it.

Output STRICT JSON only:
{ "action": "send"|"skip", "reason": "<short>", "beat": "prime"|"go"|"check", "continue_task": <bool>, "task_done": <bool>, "lane": "reactivation"|"ops"|"dev", "task_label": "<short label e.g. 'Email Jerry re: founding rate'>", "text": "<the SMS — very short>", "agent_brief": "<ONLY for dispatchable dev software tasks: self-contained spec for the cloud agent>" }
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
  agent_brief?: string;
}

// Agent offers must be understandable by a non-programmer — Ladd is approving work,
// so he has to know what'll happen in his own words. The brain keeps slipping into
// dev jargon (it imitates earlier texts in the convo), so this is code-enforced: if
// an offer trips the jargon check, one small rewrite call converts it to plain
// English. Falls back to the original text — jargon beats silence.
const OFFER_JARGON_RE =
  /\b(repos?|branch(es)?|PRs?|pull request|commits?|merge[ds]?|grep|refactor\w*|configs?|deploy\w*|search\/replace)\b/i;

async function plainEnglishOffer(text: string): Promise<string> {
  try {
    const resp = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 150,
      system: `Rewrite this SMS for a smart non-programmer. It offers to do software work for him: keep it very short, keep "GO" as the call-to-action, describe the OUTCOME in everyday words, and reassure that nothing changes for users until he approves. BANNED words: repo, branch, PR, pull request, commit, merge, grep, refactor, config, deploy, search/replace, codebase. Output ONLY the rewritten SMS.`,
      messages: [{ role: 'user', content: text }],
    });
    const tb = resp.content.find((b) => b.type === 'text');
    const out = tb && 'text' in tb ? tb.text.trim() : '';
    return out && !OFFER_JARGON_RE.test(out) ? out : text;
  } catch (err) {
    console.error('[choreographer] plainEnglishOffer failed:', err);
    return text;
  }
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
    ? `label: "${active.task_label}" | lane: ${active.lane} | stage: ${active.beat_stage} | beats_sent: ${active.beats_sent} | last_beat_at: ${active.last_beat_at ?? 'never'}
current micro-step: ${typeof active.entity?.current_step === 'string' ? `"${active.entity.current_step}"` : '(none recorded)'}
last completed micro-step: ${typeof active.entity?.last_completed_step === 'string' ? `"${active.entity.last_completed_step}"` : '(none)'}
agent dispatch: ${(() => {
        const d = getDispatch(active);
        if (!d) return '(none — offer the agent if this is dispatchable dev work)';
        if (d.status === 'offered') return 'OFFERED — awaiting his GO; a brief re-offer is ok';
        if (d.status === 'queued' || d.status === 'running')
          return `${d.status.toUpperCase()} — the agent is on it; do NOT nudge this task, pick another lane or skip`;
        return `${d.status} — ${d.summary ?? ''}`;
      })()}`
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
      // Sized for the JSON + a full agent_brief (an offer's brief can run several
      // hundred tokens; 400 truncated mid-brief and the JSON parse failed).
      max_tokens: 1500,
      system: [
        { type: 'text', text: CORE_SYSTEM },
        {
          type: 'text',
          text: `# DEV PLAYBOOK (rank dev items by this; chatwithmybody first)\n${plans.v4}\n\n# AMENDMENTS\n${plans.amendments}\n\n# PRACTICE PLAYBOOK\n${plans.practice}\n\n# KNOWN FACTS (durable memory from Ladd's replies — trust over everything above)\n${plans.facts}`,
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

  if (decision.agent_brief && decision.lane === 'dev' && OFFER_JARGON_RE.test(decision.text)) {
    decision.text = await plainEnglishOffer(decision.text);
  }

  const beat = decision.beat || 'go';
  const lane = decision.lane;
  const label = decision.task_label || decision.text;

  // Agent-at-work guard: while the agent is queued/running on the in-flight task,
  // nothing about that task goes out — code-enforced so a chatty model can't nag
  // work that's already being done for him.
  const activeDispatch = getDispatch(active);
  const agentBusy =
    activeDispatch && (activeDispatch.status === 'queued' || activeDispatch.status === 'running');
  if (agentBusy && (decision.continue_task || label === active?.task_label)) {
    return {
      action: 'skip',
      reason: `agent is ${activeDispatch.status} on "${active?.task_label}" — no nudges while it works`,
      situation,
      dryRun,
    };
  }

  // Clinic-flow guard: between patients (turnover), or finishing a patient with only a
  // short turnover gap after, the ONLY thing allowed out is a quick reactivation text.
  // Hard-stop any dev/ops nudge (including a check-beat on an in-flight build) here so a
  // chatty model can't ping him about software mid-clinic.
  const clinicFlow =
    situation === 'turnover' ||
    (situation === 'prime' && moment?.gapAfterSession != null && moment.gapAfterSession <= 45);
  if (clinicFlow && lane !== 'reactivation') {
    return {
      action: 'skip',
      reason: `clinic turnover: suppressed ${lane ?? 'non-reactivation'} nudge between patients`,
      situation,
      dryRun,
    };
  }

  const result: ChoreographerDecision = {
    action: 'send',
    reason: decision.reason || beat,
    beat,
    text: decision.text,
    lane,
    taskLabel: label,
    agentBrief: decision.agent_brief,
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

  // An agent_brief makes this nudge an agent OFFER — recorded on the task so the
  // webhook can queue it the moment Ladd replies GO. Re-offers refresh the brief
  // (but never downgrade a queued/running/finished dispatch back to offered).
  const dispatchPatch =
    decision.agent_brief && lane === 'dev' && (!activeDispatch || activeDispatch.status === 'offered')
      ? {
          dispatch: {
            status: 'offered' as const,
            brief: decision.agent_brief,
            repo: AGENT_REPO,
            offered_at: new Date().toISOString(),
          },
        }
      : {};

  if (decision.task_done && active) {
    await closeTask(active.id, 'done');
  }
  if (active && decision.continue_task && !decision.task_done) {
    // The text just sent IS the current micro-step — keep it on the row so the
    // reply interpreter judges "done" against the step, not the umbrella label.
    await recordBeat(active.id, {
      stage,
      entity: { ...(active.entity ?? {}), current_step: decision.text, ...dispatchPatch },
    });
  } else if (!decision.task_done) {
    // Attach the patient identity to reactivation tasks so a "done" reply can log
    // the contact back to fasciachart and stop the patient resurfacing.
    const entity =
      lane === 'reactivation' && reactivation
        ? { patient_id: reactivation.id, name: reactivation.name, phone: reactivation.phone }
        : {};
    await startTask(userId, {
      lane: lane ?? null,
      task_label: label,
      entity: { ...entity, current_step: decision.text, ...dispatchPatch },
      beat_stage: stage,
    });
  }

  return result;
}

// =============================================================================
// Reactivity (Phase 5): interpret a reply to the in-flight task and adapt.
// Called from the SMS webhook when an active task exists. Returns the instant ack
// to send, or null if the reply isn't about the task (fall through to list handling).
// =============================================================================
const REPLY_SYSTEM = `You interpret Ladd's SMS reply to a nudge about the task in flight, and write a SHORT acknowledgment that keeps momentum. You're a real-person accountability texter, not an app.

Big tasks are nudged in BABY STEPS: the task label is the umbrella project ("Rebrand X → Y"), but each nudge is one tiny micro-step (the CURRENT STEP in the input). An affirmative reply almost always means the STEP, not the project.

Classify what his reply means about the in-flight task:
- done: the WHOLE task (the label) is finished. Only when his words clearly cover the full label ("rebrand's done", "shipped it", "all renamed and deployed"). EXCEPTION: if the label is itself one atomic action ("Text Janet Gose", "Email Jerry"), an affirmative IS done.
- step_done: he did the CURRENT STEP, or his reply makes it moot ("Yes I already own that domain" when the step was buying the domain). The project continues — the next nudge gives the next step.
- deferred: he'll do it but is doing something else first ("call first", "in a sec").
- declined: he can't / won't right now ("with a patient", "no", "later").
- unrelated: the reply isn't about this task at all.

When in doubt between done and step_done on a project-sized label, pick step_done — wrongly closing a live project is far worse than one extra check-in.

Write a short ack:
- done: celebrate in ~3 words AND, if a next item is given, hand it to him ("Nice — next is George Ruiz.").
- step_done: tiny celebrate, momentum forward ("Good — next step coming."). NEVER imply the whole task is finished.
- deferred: acknowledge the detour and re-point ("Cool — then text Janet.").
- declined: brief, no guilt ("All good. Later.").
- unrelated: leave ack empty.

Rules: VERY short. No preamble. Real names. Don't parrot his words.

Output strict JSON: { "meaning": "done"|"step_done"|"deferred"|"declined"|"unrelated", "ack": "<short text or empty>" }`;

export async function handleNudgeReply(
  userId: string,
  active: NudgeTask,
  incoming: string,
  convo: string
): Promise<string | null> {
  const currentPid =
    active.entity && active.entity.patient_id != null ? Number(active.entity.patient_id) : null;
  const currentStep =
    typeof active.entity?.current_step === 'string' ? active.entity.current_step : null;

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

# CURRENT STEP (the micro-step he was last nudged — judge "done" against THIS)
${currentStep ? `"${currentStep}"` : '(none recorded — judge against the label)'}

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

  // Reactivation labels are atomic ("Text Janet Gose") — a completed step IS the
  // task. Normalize so the fasciachart loop-close below always fires for them.
  if (parsed.meaning === 'step_done' && active.lane === 'reactivation') {
    parsed.meaning = 'done';
  }

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
  } else if (parsed.meaning === 'step_done') {
    // A micro-step landed but the umbrella task lives on: archive the step as
    // completed and clear current_step so the next tick hands the NEXT step
    // (and a stray second reply isn't judged against a step he already did).
    await updateTask(active.id, {
      entity: {
        ...(active.entity ?? {}),
        last_completed_step: currentStep ?? incoming,
        current_step: null,
      },
    });
  } else if (parsed.meaning === 'declined') {
    await closeTask(active.id, 'dropped');
  }
  // deferred / other: leave the task active — the next grid tick re-checks, reading
  // this reply for context.

  return parsed.ack || null;
}

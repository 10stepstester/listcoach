// =============================================================================
// generate-plan.ts — capacity-matched planner (Phase 3).
// =============================================================================
// One Sonnet call grounded in PLAN_V4 (dev principle, chatwithmybody first) and
// PLAN_PRACTICE (practice principle) that:
//   1. assigns each open leaf to-do { lane, est_minutes, is_emergency }
//   2. produces an ordered queue (most important first)
// then persists those tags back onto the subtasks (without clobbering existing
// non-null values / user overrides), measures the day's calendar density, and
// upserts daily_advisory with plan_queue + day_type. recommended_focus and
// nudge_guidance are kept pointed at the top queue item for backward compat with
// check-goals. Idempotent on (user_id, date).
//
// Callable standalone from the morning advisory and the SMS webhook (re-rank).
// =============================================================================

import Anthropic from '@anthropic-ai/sdk';
import { supabase } from '@/lib/db';
import { PLAN_V4, PLAN_AMENDMENTS, PLAN_PRACTICE, planWeek } from '@/lib/plan';
import { getDayDensity } from '@/lib/google-calendar';
import type { Subtask } from '@/types/index';

const anthropic = new Anthropic();

export type Lane = 'practice' | 'dev';

export interface PlanQueueItem {
  subtask_id: string;
  title: string;
  parent_title: string | null;
  lane: Lane;
  est_minutes: number | null;
  priority: number; // 1-based queue position
  is_emergency: boolean;
}

export interface GeneratePlanResult {
  success: boolean;
  plan_queue: PlanQueueItem[];
  day_type: string | null;
  recommended_focus: string | null;
  error?: string;
}

// Parents (or top-level leaves) whose title matches one of these default to the
// practice lane; everything else defaults to dev. The Sonnet call can override.
const PRACTICE_PATTERNS: RegExp[] = [
  /sprint/i,
  /reactivat/i,
  /patient/i,
  /check-?in/i,
  /email|newsletter|broadcast/i,
  /social|instagram|\bIG\b|post/i,
  /content/i,
  /referral|coffee/i,
  /\bGBP\b|google business|review/i,
  /clinic|booking/i,
];

function defaultLane(parentTitle: string | null): Lane {
  if (!parentTitle) return 'dev';
  return PRACTICE_PATTERNS.some((re) => re.test(parentTitle)) ? 'practice' : 'dev';
}

const ISO_DOW: Record<string, number> = {
  Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7,
};

const PLAN_SYSTEM = `You triage and rank a working chiropractor-founder's open to-dos into a single ordered queue, grounded in two locked principles you are given: the DEV plan (PLAN_V4 — what software to build, in what order) and the PRACTICE cadence (PLAN_PRACTICE — the recurring clinic operator work). Do not re-plan or invent tasks; only triage the ones provided.

For each item assign:
- lane: "dev" (building software products) or "practice" (clinic operator work).
- est_minutes: a realistic size estimate (e.g. 3, 15, 45, 90, 180).
- is_emergency: true ONLY for genuinely time-critical, drop-everything items (a real deadline today, something breaking, money at risk). Default false.

Then output an ordered queue (most important first) by index. Ranking rules:
- Dev items rank by PLAN_V4. chatwithmybody is the #1 dev bet — its items come before other dev work.
- Practice items rank by PLAN_PRACTICE (reactivation/check-ins first, then weekly email, etc.).
- Emergencies rank at the very top regardless of lane.

Output strict JSON only, no markdown:
{ "items": [ { "i": <index>, "lane": "dev"|"practice", "est_minutes": <int>, "is_emergency": <bool> } ], "queue": [ <indices, most important first> ] }`;

interface ModelItem {
  i: number;
  lane?: string;
  est_minutes?: number | null;
  is_emergency?: boolean;
}
interface ModelOutput {
  items?: ModelItem[];
  queue?: number[];
}

async function callPlanModel(
  leaves: Subtask[],
  parentTitleOf: (s: Subtask) => string | null
): Promise<ModelOutput> {
  const lines = leaves
    .map((s, i) => `${i}|${parentTitleOf(s) ?? '(no project)'}|${s.title}`)
    .join('\n');

  const userPrompt = `# DEV PRINCIPLE (PLAN_V4 — rank dev items by this; chatwithmybody first)
${PLAN_V4}

# DATED AMENDMENTS (override the plan where they conflict)
${PLAN_AMENDMENTS}

# PRACTICE PRINCIPLE (PLAN_PRACTICE — rank practice items by this)
${PLAN_PRACTICE}

# CURRENT PLAN WEEK
${planWeek()}

# OPEN TO-DOS (format: index|project|title)
${lines}

Triage and rank all ${leaves.length} items. Output the JSON now.`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    // Output scales with the number of to-dos (one object + one queue index each).
    // ~100 tokens/item headroom, capped so a huge list can't run away.
    max_tokens: Math.min(16000, 1200 + leaves.length * 120),
    system: PLAN_SYSTEM,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const textBlock = response.content.find((block) => block.type === 'text');
  let raw = textBlock?.text.trim() || '{}';
  raw = raw.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
  return JSON.parse(raw) as ModelOutput;
}

export async function generatePlan(
  userId: string,
  opts: { dryRun?: boolean } = {}
): Promise<GeneratePlanResult> {
  const { dryRun = false } = opts;
  const empty: GeneratePlanResult = {
    success: false,
    plan_queue: [],
    day_type: null,
    recommended_focus: null,
  };

  try {
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (userError || !user) {
      return { ...empty, error: 'user not found' };
    }

    const { data: goals } = await supabase
      .from('goals')
      .select('*, subtasks(*)')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('position');

    const allSubtasks: Subtask[] = (goals || []).flatMap((g) => g.subtasks || []);
    const byId = new Map(allSubtasks.map((s) => [s.id, s]));
    const parentIds = new Set(allSubtasks.filter((s) => s.parent_id).map((s) => s.parent_id));

    // Open leaf to-dos: not completed and not a parent of other items (i.e. the
    // actual to-dos, not the project-header rows above them).
    const leaves = allSubtasks.filter((s) => !s.is_completed && !parentIds.has(s.id));

    const parentTitleOf = (s: Subtask): string | null =>
      (s.parent_id && byId.get(s.parent_id)?.title) || null;

    // Timezone-aware "today" + ISO weekday in the user's zone.
    const now = new Date();
    const todayLocal = new Intl.DateTimeFormat('en-CA', { timeZone: user.timezone }).format(now);
    const weekdayShort = new Intl.DateTimeFormat('en-US', {
      timeZone: user.timezone,
      weekday: 'short',
    }).format(now);
    const isoDow = ISO_DOW[weekdayShort] ?? 0;

    // ---- day_type from clinic-day calendar density ----
    const clinicDays = (user.clinic_days || '')
      .split(',')
      .map((d: string) => d.trim())
      .filter(Boolean);
    const isClinicDay = clinicDays.includes(String(isoDow));

    let dayType: string | null;
    if (!isClinicDay) {
      dayType = 'open'; // not a clinic day — no patient blackout to suppress around
    } else if (user.google_calendar_token && user.google_calendar_refresh_token) {
      const density = await getDayDensity(
        user.google_calendar_token,
        user.google_calendar_refresh_token,
        userId,
        now,
        user.timezone,
        user.clinic_start,
        user.clinic_end
      );
      dayType = density.isFull ? 'full' : 'normal';
    } else {
      dayType = 'normal'; // clinic day but no calendar to measure
    }

    // No open to-dos: clear the queue but still record day_type.
    if (leaves.length === 0) {
      if (!dryRun) {
        await supabase
          .from('daily_advisory')
          .upsert(
            {
              user_id: userId,
              date: todayLocal,
              plan_queue: [],
              day_type: dayType,
            },
            { onConflict: 'user_id,date' }
          );
      }
      return { success: true, plan_queue: [], day_type: dayType, recommended_focus: null };
    }

    // ---- one Sonnet triage/rank call (degrade gracefully on failure) ----
    let model: ModelOutput;
    try {
      model = await callPlanModel(leaves, parentTitleOf);
    } catch (err) {
      console.error('[generatePlan] model call/parse failed, using defaults:', err);
      model = {};
    }

    const modelByIndex = new Map<number, ModelItem>();
    for (const item of model.items || []) {
      if (typeof item.i === 'number') modelByIndex.set(item.i, item);
    }

    // Build the ordered queue of indices: model's queue first (valid + unique),
    // then any leaves the model omitted, appended in original order.
    const order: number[] = [];
    const seen = new Set<number>();
    for (const idx of model.queue || []) {
      if (idx >= 0 && idx < leaves.length && !seen.has(idx)) {
        order.push(idx);
        seen.add(idx);
      }
    }
    for (let i = 0; i < leaves.length; i++) {
      if (!seen.has(i)) order.push(i);
    }

    // ---- resolve final values (don't clobber existing non-null / user overrides),
    // build plan_queue, and collect per-subtask patches ----
    const planQueue: PlanQueueItem[] = [];
    const patches: { id: string; patch: Record<string, unknown> }[] = [];

    order.forEach((leafIdx, position) => {
      const s = leaves[leafIdx];
      const m = modelByIndex.get(leafIdx);
      const parentTitle = parentTitleOf(s);

      // lane: existing non-null wins, else model, else parentage default.
      const modelLane: Lane | null =
        m?.lane === 'practice' || m?.lane === 'dev' ? m.lane : null;
      const lane: Lane = (s.lane as Lane | null) ?? modelLane ?? defaultLane(parentTitle);

      // est_minutes: existing non-null wins, else model.
      const modelEst =
        typeof m?.est_minutes === 'number' && m.est_minutes > 0 ? m.est_minutes : null;
      const estMinutes: number | null = s.est_minutes ?? modelEst;

      // priority: existing non-null wins, else queue position (1-based).
      const priority: number = s.priority ?? position + 1;

      // is_emergency: default is false (non-null), so "don't clobber" can't apply —
      // an already-true flag (user or prior run) stays true; otherwise the model decides.
      const isEmergency: boolean = s.is_emergency === true ? true : m?.is_emergency === true;

      planQueue.push({
        subtask_id: s.id,
        title: s.title,
        parent_title: parentTitle,
        lane,
        est_minutes: estMinutes,
        priority,
        is_emergency: isEmergency,
      });

      // Only persist fields that are currently unset (fill nulls), plus a newly
      // raised emergency flag. This protects user overrides on re-run.
      const patch: Record<string, unknown> = {};
      if (s.lane == null) patch.lane = lane;
      if (s.est_minutes == null && estMinutes != null) patch.est_minutes = estMinutes;
      if (s.priority == null) patch.priority = priority;
      if (s.is_emergency !== true && isEmergency) patch.is_emergency = true;
      if (Object.keys(patch).length > 0) patches.push({ id: s.id, patch });
    });

    // Persist patches (one update per changed subtask; only changed ones).
    if (!dryRun) {
      for (const { id, patch } of patches) {
        const { error: updErr } = await supabase.from('subtasks').update(patch).eq('id', id);
        if (updErr) console.error(`[generatePlan] failed to tag subtask ${id}:`, updErr);
      }
    }

    // Emergencies jump the queue regardless of model ordering.
    planQueue.sort((a, b) => {
      if (a.is_emergency !== b.is_emergency) return a.is_emergency ? -1 : 1;
      return a.priority - b.priority;
    });

    const top = planQueue[0] || null;
    const recommendedFocus = top?.title ?? null;
    const nudgeGuidance = top
      ? `Top of the queue: "${top.title}"${top.parent_title ? ` (${top.parent_title})` : ''} — ${top.lane} lane${top.est_minutes ? `, ~${top.est_minutes}m` : ''}.${top.is_emergency ? ' EMERGENCY — handle first.' : ''}`
      : null;

    // Upsert ONLY the plan columns so morning-advisory's sprint_snapshot /
    // yesterday_activity / advisor_transcript survive when the row already exists.
    if (!dryRun) {
      const { error: upsertErr } = await supabase
        .from('daily_advisory')
        .upsert(
          {
            user_id: userId,
            date: todayLocal,
            plan_queue: planQueue,
            day_type: dayType,
            recommended_focus: recommendedFocus,
            nudge_guidance: nudgeGuidance,
          },
          { onConflict: 'user_id,date' }
        );

      if (upsertErr) {
        console.error('[generatePlan] daily_advisory upsert error:', upsertErr);
        return { ...empty, plan_queue: planQueue, day_type: dayType, error: 'upsert failed' };
      }
    }

    console.log(
      `[generatePlan] ${todayLocal}: ${planQueue.length} items, day_type=${dayType}, top="${recommendedFocus}"`
    );

    return {
      success: true,
      plan_queue: planQueue,
      day_type: dayType,
      recommended_focus: recommendedFocus,
    };
  } catch (error) {
    console.error('[generatePlan] error:', error);
    return { ...empty, error: error instanceof Error ? error.message : 'unknown' };
  }
}

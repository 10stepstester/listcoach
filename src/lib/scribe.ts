// =============================================================================
// scribe.ts — durable reply-memory (the grounding layer).
// =============================================================================
// The choreographer's brain only sees the last 8 texts, so anything Ladd tells it
// ("I already own that domain") evaporates within the hour. The scribe fixes that
// with two paths writing to the 'facts' plan doc ("what the choreographer knows"):
//
//   Fast path — scribeReply(): runs on every inbound SMS (via after() in the
//   webhook). One small model call asks "did this reply establish anything
//   durably true?" and appends dated bullets immediately, so the next 10-min
//   tick already knows.
//
//   Slow path — compactFacts(): nightly janitor. Rewrites the doc — merges
//   duplicates, resolves contradictions in favor of the newest statement, folds
//   in the day's completed nudge tasks, drops ephemera — so the doc stays short
//   and coherent over months.
//
// Ground rule for both: facts come from LADD'S OWN words (and recorded task
// completions). Outbound bot texts are context only — never a fact source, so a
// bot hallucination can't become permanent memory.
// =============================================================================
import Anthropic from '@anthropic-ai/sdk';
import { supabase } from '@/lib/db';
import { getActivePlans, appendFacts, savePlanDoc } from '@/lib/plan-store';

const anthropic = new Anthropic();
const MODEL = 'claude-sonnet-4-5-20250929';

function localDate(timezone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(now);
}

// --- fast path: extract durable facts from one inbound reply ------------------
const EXTRACT_SYSTEM = `You maintain the durable memory of an SMS accountability system for Ladd (a chiropractor-founder). Given his latest inbound text, decide whether it establishes anything DURABLY TRUE that the system should remember forever.

Durable (capture): things he owns or has already done ("already own that domain", "sent the Jerry email yesterday"), decisions ("we're not doing cold email for Path A"), standing preferences/corrections ("stop suggesting X", "call her Janet not Janet Gose"), real-world state ("Jerry said no", "workshop venue is booked").

NOT durable (ignore): ephemeral status ("with a patient", "on it", "in a sec", "done" with no object beyond the current task), pleasantries, questions, anything the OUTBOUND texts said that he didn't confirm — outbound texts are context only, never a fact source.

Rules:
- Each fact is ONE short standalone sentence, understandable with zero conversation context (resolve "it"/"that" using the convo).
- Only what HIS message establishes. Do not infer beyond his words. When unsure, omit.
- Skip anything the EXISTING FACTS already say.
- Most replies contain nothing durable — an empty list is the normal output.

Output strict JSON only: { "facts": ["<sentence>", ...] }`;

export async function scribeReply(
  userId: string,
  incoming: string,
  timezone: string
): Promise<string[]> {
  try {
    const [{ facts }, { data: recent }] = await Promise.all([
      getActivePlans(),
      supabase
        .from('sms_conversations')
        .select('direction, message_text')
        .eq('user_id', userId)
        .order('sent_at', { ascending: false })
        .limit(8),
    ]);
    const convo = (recent || [])
      .reverse()
      .map((m) => `${m.direction === 'inbound' ? 'Ladd' : 'Bot'}: ${m.message_text}`)
      .join('\n');

    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 300,
      system: EXTRACT_SYSTEM,
      messages: [
        {
          role: 'user',
          content: `# EXISTING FACTS\n${facts}\n\n# RECENT CONVO (context only)\n${convo || '(none)'}\n\n# HIS LATEST REPLY\n"${incoming}"\n\nOutput the JSON.`,
        },
      ],
    });
    const tb = response.content.find((b) => b.type === 'text');
    let raw = tb && 'text' in tb ? tb.text.trim() : '{}';
    raw = raw.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
    const parsed = JSON.parse(raw) as { facts?: string[] };
    const bullets = (parsed.facts || [])
      .filter((f) => typeof f === 'string' && f.trim().length > 0)
      .map((f) => `${localDate(timezone)}: ${f.trim()}`);

    if (bullets.length > 0) {
      await appendFacts(bullets);
      console.log(`[scribe] captured ${bullets.length} fact(s):`, bullets);
    }
    return bullets;
  } catch (err) {
    // Memory capture must never break the reply flow — log and move on.
    console.error('[scribe] scribeReply failed:', err);
    return [];
  }
}

// --- slow path: nightly compaction --------------------------------------------
const COMPACT_SYSTEM = `You are the nightly janitor for the durable-memory doc of Ladd's SMS accountability system. Rewrite the doc so it stays short, current, and trustworthy.

Rules:
- KEEP the title and intro lines, then the dated bullets.
- Merge duplicates; when bullets conflict, the NEWEST date wins (drop the stale one).
- THE CARDINAL RULE — sourcing for NEW bullets: a new bullet may be added ONLY when you can point at (a) a specific INBOUND text from Ladd that states it, or (b) a closed-task record marked done. NOTHING ELSE. The outbound bot texts are a stream of suggestions about work that mostly NEVER HAPPENED — a bot text saying "now commit the rebrand" does not mean any rebrand occurred. Writing bot chatter into memory as fact is the exact corruption this doc exists to prevent. When tempted to summarize "progress" from outbound texts: don't. No inbound evidence = no bullet.
- HOW MUCH a "done" task record proves: tasks are nudged in baby steps but labeled with the umbrella project, so "done" often means Ladd said yes to ONE step (or that the step was moot). Only an ATOMIC label — one single concrete action like 'Text Janet Gose' or 'Email Jerry' — may be recorded as fully happened. For project-sized labels (a rebrand, a billing build, a landing page), NEVER write "completed/done/shipped/live"; at most write "made some progress on X", and only if an inbound text supports it.
- A task closed as "dropped" is NOT evidence anything happened.
- Today's inbound texts may clarify or correct existing bullets — apply them.
- Drop ephemera and anything that has stopped being useful. Keep every bullet's original date when carrying it forward.
- NEVER invent. If in doubt, keep the bullet as-is.
- Target: under ~50 bullets. Group related bullets together if that helps scanning.
- If today's replies imply the STRATEGY PLAYBOOK itself is wrong about something, do NOT edit strategy — add a bullet under a final "## Proposed plan amendments (awaiting Ladd)" section instead.

Output ONLY the full rewritten markdown doc — no commentary, no code fences.`;

export async function compactFacts(
  userId: string,
  timezone: string,
  opts: { dryRun?: boolean } = {}
): Promise<{ before: number; after: number; doc: string }> {
  const { facts } = await getActivePlans();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [{ data: msgs }, { data: tasks }] = await Promise.all([
    supabase
      .from('sms_conversations')
      .select('direction, message_text, sent_at')
      .eq('user_id', userId)
      .gte('sent_at', since)
      .order('sent_at', { ascending: true }),
    supabase
      .from('nudge_state')
      .select('task_label, lane, beat_stage, updated_at')
      .eq('user_id', userId)
      .in('beat_stage', ['done', 'dropped'])
      .gte('updated_at', since),
  ]);

  const convo = (msgs || [])
    .map((m) => `${m.direction === 'inbound' ? 'Ladd' : 'Bot'}: ${m.message_text}`)
    .join('\n');
  const closed = (tasks || [])
    .map((t) => `${t.beat_stage}: "${t.task_label}" (${t.lane ?? 'no lane'})`)
    .join('\n');

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4000,
    system: COMPACT_SYSTEM,
    messages: [
      {
        role: 'user',
        content: `Today is ${localDate(timezone)}.\n\n# CURRENT FACTS DOC\n${facts}\n\n# LAST 24H OF TEXTS (inbound = ground truth; outbound = context only)\n${convo || '(none)'}\n\n# TASKS CLOSED IN LAST 24H\n${closed || '(none)'}\n\nRewrite the doc now.`,
      },
    ],
  });
  const tb = response.content.find((b) => b.type === 'text');
  let doc = tb && 'text' in tb ? tb.text.trim() : '';
  doc = doc.replace(/^```(?:markdown|md)?\s*\n?/, '').replace(/\n?```\s*$/, '');

  // Refuse a suspicious rewrite (empty or lost the title) rather than wipe memory.
  if (!doc || !doc.startsWith('# What the choreographer knows')) {
    console.error('[scribe] compactFacts produced a malformed doc — keeping the old one.');
    return { before: facts.length, after: facts.length, doc: facts };
  }

  if (!opts.dryRun) await savePlanDoc('facts', doc);
  return { before: facts.length, after: doc.length, doc };
}

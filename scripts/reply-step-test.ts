// Verify the step_done reply fix: affirmative replies to a micro-step keep the
// umbrella task active; only whole-task language (or an atomic label) closes it.
// Inserts a throwaway nudge_state row (backdated so the live cron ignores it),
// runs handleNudgeReply against it, and deletes it. FASCIACHART_API_URL is unset
// in-process so the reactivation case can't hit the real loop-close API.
// Run: npx tsx scripts/reply-step-test.ts
import { readFileSync } from 'fs';

function loadEnv() {
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    if (line.trim().startsWith('#') || !line.includes('=')) continue;
    const eq = line.indexOf('=');
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (key) process.env[key] = val;
  }
}

const USER_ID = '5aa8837d-f79b-44e9-9f1f-af1557ccb7f2';
const CONVO = `You: Search the repo for chatwithmydna — just count the files.
Ladd: 14 files
You: Nice. Next: buy the chatwithmybody.com domain — just check if it's free.`;

async function main() {
  loadEnv();
  delete process.env.FASCIACHART_API_URL; // no real fasciachart calls from this test
  const { supabase } = await import('@/lib/db');
  const { handleNudgeReply } = await import('@/lib/choreographer');

  type Case = {
    name: string;
    lane: string;
    label: string;
    entity: Record<string, unknown> | null;
    reply: string;
    convo: string;
    expectStage: string; // beat_stage after the reply
  };

  const cases: Case[] = [
    {
      name: 'step made moot (the real 22:31 bug)',
      lane: 'dev',
      label: 'Rebrand chatwithmydna → chatwithmybody',
      entity: { current_step: 'Buy the chatwithmybody.com domain — just check if it’s free.' },
      reply: 'Yes I already own that domain',
      convo: CONVO,
      expectStage: 'checking', // stays active
    },
    {
      name: 'bare "done" against a micro-step',
      lane: 'dev',
      label: 'Rebrand chatwithmydna → chatwithmybody',
      entity: { current_step: 'Rename the homepage title to chatwithmybody.' },
      reply: 'done',
      convo: `You: Rename the homepage title to chatwithmybody.`,
      expectStage: 'checking', // stays active
    },
    {
      name: 'whole task clearly finished',
      lane: 'dev',
      label: 'Rebrand chatwithmydna → chatwithmybody',
      entity: { current_step: 'Rename the homepage title to chatwithmybody.' },
      reply: 'Rebrand is fully done — renamed everything and deployed',
      convo: `You: Rename the homepage title to chatwithmybody.`,
      expectStage: 'done',
    },
    {
      name: 'reactivation atomic label',
      lane: 'reactivation',
      label: 'Text Janet Gose',
      entity: { name: 'Janet Gose', current_step: 'Text Janet Gose — quick check-in.' },
      reply: 'yes sent it',
      convo: `You: Text Janet Gose — quick check-in.`,
      expectStage: 'done',
    },
  ];

  let failures = 0;
  for (const c of cases) {
    // Backdated created_at: getActiveTask orders by created_at DESC, so the live
    // cron always prefers any real in-flight row over this one.
    const { data: row, error } = await supabase
      .from('nudge_state')
      .insert({
        user_id: USER_ID,
        lane: c.lane,
        task_label: c.label,
        entity: c.entity,
        beat_stage: 'checking',
        beats_sent: 2,
        created_at: '2020-01-01T00:00:00Z',
      })
      .select()
      .single();
    if (error || !row) {
      console.error(`INSERT FAILED for "${c.name}":`, error);
      failures++;
      continue;
    }
    try {
      const ack = await handleNudgeReply(USER_ID, row, c.reply, c.convo);
      const { data: after } = await supabase
        .from('nudge_state')
        .select('beat_stage, entity')
        .eq('id', row.id)
        .single();
      const stage = after?.beat_stage ?? '(row gone)';
      const ok = stage === c.expectStage;
      if (!ok) failures++;
      console.log(`${ok ? 'PASS' : 'FAIL'}  ${c.name}`);
      console.log(`      reply: "${c.reply}"`);
      console.log(`      stage: ${stage} (expected ${c.expectStage}) | ack: "${ack ?? '(null)'}"`);
      console.log(`      entity after: ${JSON.stringify(after?.entity)}`);
    } finally {
      await supabase.from('nudge_state').delete().eq('id', row.id);
    }
  }

  console.log(failures === 0 ? '\nAll cases passed.' : `\n${failures} case(s) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
}

main();

// Verify the v5 DEV/OPS lane model across window scenarios (dry-run, simulated).
// Run: npx tsx scripts/scenario-test.ts
import { readFileSync } from 'fs';
function loadEnv() {
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    if (line.trim().startsWith('#') || !line.includes('=')) continue;
    const eq = line.indexOf('=');
    const k = line.slice(0, eq).trim();
    let v = line.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (k) process.env[k] = v;
  }
}

async function main() {
  loadEnv();
  const { supabase } = await import('@/lib/db');
  const { runChoreographer } = await import('@/lib/choreographer');

  const { data: user } = await supabase.from('users').select('id').limit(1).single();
  if (!user) { console.error('no user'); process.exit(1); }

  // Drop any in-flight task so each scenario picks fresh.
  await supabase.from('nudge_state').update({ beat_stage: 'dropped' })
    .eq('user_id', user.id).in('beat_stage', ['primed', 'assigned', 'checking']);

  const scenarios: { name: string; sim: { now?: string; situation?: any; windowMinutes?: number | null } }[] = [
    { name: 'Weekday ~30-min sliver (Tue, Phase 1)', sim: { now: '2026-06-16T10:00:00-05:00', situation: 'open', windowMinutes: 30 } },
    { name: 'Weekday evening (Tue 8pm, Phase 1)', sim: { now: '2026-06-16T20:00:00-05:00', situation: 'wide_open', windowMinutes: null } },
    { name: 'Weekend block (Sat, Phase 1)', sim: { now: '2026-06-20T10:00:00-05:00', situation: 'wide_open', windowMinutes: null } },
    { name: 'Mid-session (Tue 10am, patient)', sim: { now: '2026-06-16T10:00:00-05:00', situation: 'mid_session' } },
  ];

  for (const sc of scenarios) {
    const d = await runChoreographer(user.id, { dryRun: true, simulate: sc.sim });
    console.log(`\n=== ${sc.name} ===`);
    console.log(`  action: ${d.action}  | situation: ${d.situation}  | lane: ${d.lane ?? '-'}  | beat: ${d.beat ?? '-'}`);
    if (d.action === 'send') console.log(`  📱 "${d.text}"`);
    else console.log(`  (silent) ${d.reason}`);
  }
  process.exit(0);
}
main();

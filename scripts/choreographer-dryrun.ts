// Dry-run the choreographer brain against live data (calendar, fasciachart,
// to-dos, recent SMS, in-flight state). Sends nothing, writes nothing.
// Run: npx tsx scripts/choreographer-dryrun.ts
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

async function main() {
  loadEnv();
  const { supabase } = await import('@/lib/db');
  const { runChoreographer } = await import('@/lib/choreographer');

  const { data: user } = await supabase.from('users').select('id, phone_number, timezone').limit(1).single();
  if (!user) {
    console.error('No user.');
    process.exit(1);
  }
  const nowLocal = new Intl.DateTimeFormat('en-US', {
    timeZone: user.timezone,
    dateStyle: 'full',
    timeStyle: 'short',
  }).format(new Date());
  console.log(`Now: ${nowLocal}\nRunning choreographer (dry-run)...\n`);

  const decision = await runChoreographer(user.id, { dryRun: true });

  console.log('DECISION:');
  console.log(`  action:    ${decision.action}`);
  console.log(`  situation: ${decision.situation ?? '(n/a)'}`);
  console.log(`  reason:    ${decision.reason}`);
  if (decision.action === 'send') {
    console.log(`  beat:      ${decision.beat}`);
    console.log(`  lane:      ${decision.lane}`);
    console.log(`  task:      ${decision.taskLabel}`);
    console.log(`\n  📱 TEXT:   "${decision.text}"`);
  }
  process.exit(0);
}

main();

// Offline dry-run for generatePlan — prints the produced plan_queue without
// writing anything. Run: npx tsx scripts/plan-dryrun.ts
import { readFileSync } from 'fs';

// Load .env.local before importing anything that reads process.env at module load.
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
  const { generatePlan } = await import('@/lib/generate-plan');

  const { data: user } = await supabase.from('users').select('id, phone_number').limit(1).single();
  if (!user) {
    console.error('No user found.');
    process.exit(1);
  }

  console.log(`User: ${user.phone_number} (${user.id})\nRunning generatePlan dry-run...\n`);
  const result = await generatePlan(user.id, { dryRun: true });

  console.log(`success: ${result.success}${result.error ? `  error: ${result.error}` : ''}`);
  console.log(`day_type: ${result.day_type}`);
  console.log(`recommended_focus: ${result.recommended_focus}\n`);
  console.log(`plan_queue (${result.plan_queue.length} items):`);
  for (const it of result.plan_queue) {
    const emg = it.is_emergency ? ' 🚨EMERGENCY' : '';
    const size = it.est_minutes != null ? `~${it.est_minutes}m` : '~?m';
    console.log(
      `  #${String(it.priority).padStart(2)} [${it.lane.padEnd(8)}] ${size.padStart(5)}  ${it.title}  ⟵ ${it.parent_title ?? '(no project)'}${emg}`
    );
  }
  process.exit(0);
}

main();

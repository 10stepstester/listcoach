// One-off: upgrade to playbook v5.
//  1. Upsert docs/plan-v5.md into plan_docs key 'v4' (the live source) + read back.
//  2. Rewrite src/lib/plan.ts: PLAN_START → 2026-06-13, and PLAN_V4 fallback → v5
//     (backticks/${ escaped programmatically so the template literal stays valid).
// Run: npx tsx scripts/load-v5.ts
import { readFileSync, writeFileSync } from 'fs';

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

function escapeTemplate(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
}

async function main() {
  loadEnv();
  const v5 = readFileSync('docs/plan-v5.md', 'utf8');

  // --- Step 1: DB upsert + read back ---
  const { savePlanDoc, getActivePlans } = await import('@/lib/plan-store');
  await savePlanDoc('v4', v5);
  const plans = await getActivePlans();
  const dbV4 = plans.v4;
  console.log('=== plan_docs key "v4" read-back ===');
  console.log('byte match with file:', dbV4 === v5, `(db ${dbV4.length} / file ${v5.length})`);
  console.log('first line:', JSON.stringify(dbV4.split('\n')[0]));
  console.log('has "v5":', dbV4.includes('**v5**'), '| has chatwithmybody:', dbV4.includes('chatwithmybody'));
  console.log('has DEV/OPS lanes:', dbV4.includes('[DEV]') && dbV4.includes('[OPS]'));

  // --- Steps 2+3: rewrite plan.ts ---
  let plan = readFileSync('src/lib/plan.ts', 'utf8');
  plan = plan.replace(
    /export const PLAN_START = new Date\('[^']*'\);[^\n]*/,
    "export const PLAN_START = new Date('2026-06-13T00:00:00-05:00'); // v5 Week 1, Day 1 (Sat, America/Chicago)"
  );
  const startMarker = 'export const PLAN_V4 = `';
  const endMarker = '`.trim();';
  const s = plan.indexOf(startMarker);
  const e = plan.indexOf(endMarker, s);
  if (s === -1 || e === -1) throw new Error('PLAN_V4 markers not found in plan.ts');
  const before = plan.slice(0, s);
  const after = plan.slice(e + endMarker.length);
  plan = `${before}export const PLAN_V4 = \`\n${escapeTemplate(v5)}\n\`.trim();${after}`;
  writeFileSync('src/lib/plan.ts', plan);
  console.log('\nplan.ts rewritten: PLAN_START → 2026-06-13, PLAN_V4 fallback → v5.');
  process.exit(0);
}

main();

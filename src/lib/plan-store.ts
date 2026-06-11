// =============================================================================
// plan-store.ts — runtime-editable playbooks (server only).
// =============================================================================
// The choreographer/advisory read the strategy from here. If a key has been edited
// (saved into plan_docs from Settings) that wins; otherwise the code constant in
// plan.ts is the default. Editing a plan in Settings changes nudges with no deploy.
// =============================================================================
import { supabase } from '@/lib/db';
import { PLAN_V4, PLAN_PRACTICE, PLAN_AMENDMENTS, PLAN_FACTS } from '@/lib/plan';

export type PlanKey = 'v4' | 'practice' | 'amendments' | 'facts';

export const PLAN_DEFAULTS: Record<PlanKey, string> = {
  v4: PLAN_V4,
  practice: PLAN_PRACTICE,
  amendments: PLAN_AMENDMENTS,
  facts: PLAN_FACTS,
};

export async function getActivePlans(): Promise<Record<PlanKey, string>> {
  try {
    const { data } = await supabase.from('plan_docs').select('key, content');
    const map = new Map((data || []).map((r) => [r.key as string, r.content as string]));
    return {
      v4: map.get('v4') ?? PLAN_DEFAULTS.v4,
      practice: map.get('practice') ?? PLAN_DEFAULTS.practice,
      amendments: map.get('amendments') ?? PLAN_DEFAULTS.amendments,
      facts: map.get('facts') ?? PLAN_DEFAULTS.facts,
    };
  } catch (err) {
    console.error('[plan-store] getActivePlans error:', err);
    return { ...PLAN_DEFAULTS };
  }
}

// Append dated bullets to the facts doc (the scribe's fast path). Reads the live
// doc (or the code default on first write) and saves it back with the new lines.
export async function appendFacts(bullets: string[]): Promise<void> {
  if (bullets.length === 0) return;
  const { facts } = await getActivePlans();
  const lines = bullets.map((b) => (b.startsWith('- ') ? b : `- ${b}`));
  await savePlanDoc('facts', `${facts.trimEnd()}\n${lines.join('\n')}`);
}

export async function savePlanDoc(key: PlanKey, content: string): Promise<void> {
  const { error } = await supabase
    .from('plan_docs')
    .upsert({ key, content, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) console.error(`[plan-store] savePlanDoc(${key}) error:`, error);
}

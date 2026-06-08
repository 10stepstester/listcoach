import { readFileSync } from 'fs';
function loadEnv(){ for (const line of readFileSync('.env.local','utf8').split('\n')) {
  if (line.trim().startsWith('#')||!line.includes('=')) continue;
  const eq=line.indexOf('='); const k=line.slice(0,eq).trim(); let v=line.slice(eq+1).trim();
  if((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'")))v=v.slice(1,-1);
  if(k)process.env[k]=v; } }
async function main(){
  loadEnv();
  const { supabase } = await import('@/lib/db');
  const { data: before } = await supabase.from('nudge_state').select('task_label,beat_stage').in('beat_stage',['primed','assigned','checking']);
  console.log('active tasks before:', JSON.stringify(before));
  const { error } = await supabase.from('nudge_state').update({ beat_stage:'dropped', updated_at:new Date().toISOString() }).in('beat_stage',['primed','assigned','checking']);
  console.log('drop error:', error?.message ?? 'none');
  process.exit(0);
}
main();

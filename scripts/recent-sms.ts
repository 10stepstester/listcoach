import { readFileSync } from 'fs';
function loadEnv(){ for (const line of readFileSync('.env.local','utf8').split('\n')) {
  if (line.trim().startsWith('#')||!line.includes('=')) continue;
  const eq=line.indexOf('='); const k=line.slice(0,eq).trim(); let v=line.slice(eq+1).trim();
  if((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'")))v=v.slice(1,-1);
  if(k)process.env[k]=v; } }
async function main(){
  loadEnv();
  const { supabase } = await import('@/lib/db');
  const { data } = await supabase.from('sms_conversations').select('direction,message_text,sent_at').order('sent_at',{ascending:false}).limit(5);
  console.log('--- recent SMS (oldest->newest) ---');
  for (const m of (data||[]).reverse()) console.log(`[${m.sent_at}] ${m.direction}: ${m.message_text}`);
  const { data: ns } = await supabase.from('nudge_state').select('task_label,lane,beat_stage,beats_sent,created_at').order('created_at',{ascending:false}).limit(3);
  console.log('\n--- nudge_state (latest) ---');
  for (const t of ns||[]) console.log(`${t.created_at} | ${t.beat_stage} | ${t.lane} | ${t.task_label}`);
  process.exit(0);
}
main();

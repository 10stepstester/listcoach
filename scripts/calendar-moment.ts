// Prints the current CalendarMoment + window situation against the live calendar.
// Read-only (freebusy query). Run: npx tsx scripts/calendar-moment.ts
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
  const { getCalendarMoment, classifyWindow } = await import('@/lib/google-calendar');

  const { data: user } = await supabase
    .from('users')
    .select('id, phone_number, timezone, google_calendar_token, google_calendar_refresh_token')
    .limit(1)
    .single();

  if (!user) {
    console.error('No user found.');
    process.exit(1);
  }
  if (!user.google_calendar_token || !user.google_calendar_refresh_token) {
    console.error('User has no Google Calendar tokens — cannot read calendar.');
    process.exit(1);
  }

  const nowLocal = new Intl.DateTimeFormat('en-US', {
    timeZone: user.timezone,
    dateStyle: 'full',
    timeStyle: 'short',
  }).format(new Date());
  console.log(`Now: ${nowLocal} (${user.timezone})\n`);

  const moment = await getCalendarMoment(
    user.google_calendar_token,
    user.google_calendar_refresh_token,
    user.id
  );
  console.log('CalendarMoment:', JSON.stringify(moment, null, 2));
  console.log('\nwindow situation:', classifyWindow(moment));
  process.exit(0);
}

main();

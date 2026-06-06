// Debug: dump raw freebusy intervals on the patient calendar. Read-only.
// Run: npx tsx scripts/calendar-raw.ts
import { readFileSync } from 'fs';
import { google } from 'googleapis';

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

const PATIENT_CALENDAR_ID =
  'b4b249e38c5b3bfcc1c7e63e82ed0c96cdcb032cc83008a6c96985ce4277848d@group.calendar.google.com';

async function main() {
  loadEnv();
  const { supabase } = await import('@/lib/db');
  const { data: user } = await supabase
    .from('users')
    .select('timezone, google_calendar_token, google_calendar_refresh_token')
    .limit(1)
    .single();
  if (!user?.google_calendar_token) {
    console.error('no token');
    process.exit(1);
  }

  const oauth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  oauth.setCredentials({
    access_token: user.google_calendar_token,
    refresh_token: user.google_calendar_refresh_token,
  });
  const calendar = google.calendar({ version: 'v3', auth: oauth });

  const now = new Date();
  const timeMin = new Date(now.getTime() - 3 * 60 * 60000);
  const timeMax = new Date(now.getTime() + 12 * 60 * 60000);
  const res = await calendar.freebusy.query({
    requestBody: {
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      items: [{ id: PATIENT_CALENDAR_ID }],
    },
  });
  const busy = res.data.calendars?.[PATIENT_CALENDAR_ID]?.busy || [];
  const fmt = (s: string) =>
    new Intl.DateTimeFormat('en-US', {
      timeZone: user.timezone,
      weekday: 'short',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(s));

  console.log(`Window: ${fmt(timeMin.toISOString())} → ${fmt(timeMax.toISOString())} (${user.timezone})`);
  console.log(`${busy.length} busy block(s):`);
  for (const b of busy) {
    const mins = Math.round((new Date(b.end!).getTime() - new Date(b.start!).getTime()) / 60000);
    console.log(`  ${fmt(b.start!)} → ${fmt(b.end!)}  (${mins} min)`);
  }
  process.exit(0);
}

main();

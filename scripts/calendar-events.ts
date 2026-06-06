// Verify calendar.readonly: read actual EVENTS (titles + times) on the patient
// calendar for today. Old freebusy scope could not do this. Read-only.
// Run: npx tsx scripts/calendar-events.ts
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
  const timeMin = new Date(now.getTime() - 18 * 60 * 60000); // earlier today
  const timeMax = new Date(now.getTime() + 72 * 60 * 60000); // next 3 days
  const fmt = (s?: string | null) =>
    s
      ? new Intl.DateTimeFormat('en-US', {
          timeZone: user.timezone,
          weekday: 'short',
          hour: 'numeric',
          minute: '2-digit',
        }).format(new Date(s))
      : '(all-day)';

  try {
    const res = await calendar.events.list({
      calendarId: PATIENT_CALENDAR_ID,
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
    });
    const events = res.data.items || [];
    console.log(`✅ events.list succeeded — calendar.readonly is active.\n`);
    console.log(`${events.length} event(s) in window:`);
    for (const e of events) {
      const start = e.start?.dateTime || e.start?.date;
      const end = e.end?.dateTime || e.end?.date;
      const allDay = !e.start?.dateTime;
      const mins =
        e.start?.dateTime && e.end?.dateTime
          ? Math.round((new Date(e.end.dateTime).getTime() - new Date(e.start.dateTime).getTime()) / 60000)
          : null;
      console.log(
        `  ${allDay ? '[ALL-DAY] ' : ''}${fmt(start)} → ${fmt(end)}${mins != null ? ` (${mins}m)` : ''}  —  ${e.summary || '(no title)'}`
      );
    }
  } catch (err) {
    console.error('❌ events.list FAILED — tokens may still lack calendar.readonly:');
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
  process.exit(0);
}

main();

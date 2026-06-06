import { google } from 'googleapis';
import { supabase } from '@/lib/db';

// calendar.readonly is a superset of freebusy — it still answers free/busy AND lets us
// read individual events (so we can tell a real patient visit from an all-day block and
// see each appointment's boundaries). gmail.readonly is for voicemail-emails (later phase);
// bundled here so Ladd re-consents only once.
const SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/gmail.readonly',
];

// Nudges are suppressed only during appointments on the patient calendar (Bookeo),
// not personal blocks on the primary calendar. Free/busy can query any calendar the
// user can access using the existing freebusy scope — no extra permission needed.
const PATIENT_CALENDAR_ID =
  'b4b249e38c5b3bfcc1c7e63e82ed0c96cdcb032cc83008a6c96985ce4277848d@group.calendar.google.com';

function getOAuth2Client() {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  const redirectUri = (process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/auth/google/callback').trim();

  if (!clientId || !clientSecret) {
    return null;
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

export function getAuthUrl(): string | null {
  const oauth2Client = getOAuth2Client();
  if (!oauth2Client) {
    console.log('[Google Calendar] OAuth credentials not configured.');
    return null;
  }

  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
  });
}

export async function getTokens(code: string): Promise<{ access_token: string; refresh_token: string } | null> {
  const oauth2Client = getOAuth2Client();
  if (!oauth2Client) {
    console.log('[Google Calendar] OAuth credentials not configured.');
    return null;
  }

  try {
    const { tokens } = await oauth2Client.getToken(code);
    if (!tokens.access_token || !tokens.refresh_token) {
      console.error('[Google Calendar] Missing tokens in response.');
      return null;
    }
    return {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
    };
  } catch (error) {
    console.error('[Google Calendar] Error exchanging code for tokens:', error);
    return null;
  }
}

export async function refreshAccessToken(refreshToken: string): Promise<string | null> {
  const oauth2Client = getOAuth2Client();
  if (!oauth2Client) {
    console.log('[Google Calendar] OAuth credentials not configured.');
    return null;
  }

  try {
    oauth2Client.setCredentials({ refresh_token: refreshToken });
    const { credentials } = await oauth2Client.refreshAccessToken();
    return credentials.access_token || null;
  } catch (error) {
    console.error('[Google Calendar] Error refreshing access token:', error);
    return null;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function checkFreeBusy(oauth2Client: any): Promise<boolean> {
  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
  const now = new Date();
  // Check a 10-minute window: 5 min ago to 5 min from now.
  // Catches an appointment currently happening or starting within ~5 min, while
  // leaving the between-patient gaps open for nudges. A wider look-ahead (e.g. 25
  // min) swallows the ~30-min gaps entirely and suppresses every tick.
  const windowStart = new Date(now.getTime() - 5 * 60000);
  const windowEnd = new Date(now.getTime() + 5 * 60000);
  const response = await calendar.freebusy.query({
    requestBody: {
      timeMin: windowStart.toISOString(),
      timeMax: windowEnd.toISOString(),
      items: [{ id: PATIENT_CALENDAR_ID }],
    },
  });

  const busySlots = response.data.calendars?.[PATIENT_CALENDAR_ID]?.busy || [];
  const errors = response.data.calendars?.[PATIENT_CALENDAR_ID]?.errors;
  if (errors && errors.length > 0) {
    console.error('[Google Calendar] FreeBusy API errors:', JSON.stringify(errors));
  }
  console.log(`[Google Calendar] FreeBusy check: ${busySlots.length} busy slots in window ${windowStart.toISOString()} - ${windowEnd.toISOString()}`);
  return busySlots.length > 0;
}

// ---------------------------------------------------------------------------
// Capacity helpers (Phase 2). These reuse the same freebusy scope and patient
// calendar as hasEventNow, but answer "how much room is there?" rather than the
// boolean "am I busy right now?". hasEventNow / checkFreeBusy are intentionally
// left untouched.
// ---------------------------------------------------------------------------

type BusySlot = { start: Date; end: Date };

// Run one freebusy query against the patient calendar for an arbitrary window and
// return the raw busy intervals as Date pairs.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function queryBusy(oauth2Client: any, timeMin: Date, timeMax: Date): Promise<BusySlot[]> {
  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
  const response = await calendar.freebusy.query({
    requestBody: {
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      items: [{ id: PATIENT_CALENDAR_ID }],
    },
  });

  const cal = response.data.calendars?.[PATIENT_CALENDAR_ID];
  if (cal?.errors && cal.errors.length > 0) {
    console.error('[Google Calendar] FreeBusy API errors:', JSON.stringify(cal.errors));
  }
  return (cal?.busy || [])
    .filter((b) => b.start && b.end)
    .map((b) => ({ start: new Date(b.start!), end: new Date(b.end!) }));
}

type CalEvent = { start: Date; end: Date; title: string; allDay: boolean };

// Read actual events (titles + boundaries) on the patient calendar. Unlike freebusy,
// this exposes individual appointments and their gaps — what the choreographer needs.
// Requires the calendar.readonly scope.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function queryEvents(oauth2Client: any, timeMin: Date, timeMax: Date): Promise<CalEvent[]> {
  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
  const res = await calendar.events.list({
    calendarId: PATIENT_CALENDAR_ID,
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
  });
  const events: CalEvent[] = [];
  for (const e of res.data.items || []) {
    const startStr = e.start?.dateTime || e.start?.date;
    const endStr = e.end?.dateTime || e.end?.date;
    if (!startStr || !endStr) continue;
    events.push({
      start: new Date(startStr),
      end: new Date(endStr),
      title: e.summary || '(no title)',
      allDay: !e.start?.dateTime, // all-day events have a date, not a dateTime
    });
  }
  return events;
}

// Build an authed client, run `fn`, and on auth failure refresh the token once and
// retry — mirroring hasEventNow's refresh handling so the capacity helpers survive
// an expired access token. Returns `fallback` if auth can't be established.
async function withFreeBusyAuth<T>(
  accessToken: string,
  refreshToken: string,
  userId: string,
  fallback: T,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fn: (client: any) => Promise<T>
): Promise<T> {
  const oauth2Client = getOAuth2Client();
  if (!oauth2Client) {
    return fallback;
  }

  oauth2Client.setCredentials({ access_token: accessToken, refresh_token: refreshToken });
  oauth2Client.on('tokens', async (tokens) => {
    if (tokens.access_token) {
      try {
        await supabase
          .from('users')
          .update({ google_calendar_token: tokens.access_token })
          .eq('id', userId);
      } catch (err) {
        console.error('[Google Calendar] Error updating token in DB:', err);
      }
    }
  });

  try {
    return await fn(oauth2Client);
  } catch (error) {
    console.error('[Google Calendar] Free/busy error:', error);
    try {
      const newToken = await refreshAccessToken(refreshToken);
      if (newToken) {
        await supabase
          .from('users')
          .update({ google_calendar_token: newToken })
          .eq('id', userId);
        oauth2Client.setCredentials({ access_token: newToken, refresh_token: refreshToken });
        return await fn(oauth2Client);
      }
    } catch (retryError) {
      console.error('[Google Calendar] Retry failed:', retryError);
    }
    return fallback;
  }
}

// Offset (ms) of an IANA timezone at a given instant, as localWallClock - UTC.
function tzOffsetMs(timeZone: string, at: Date): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const map: Record<string, number> = {};
  for (const part of dtf.formatToParts(at)) {
    if (part.type !== 'literal') map[part.type] = parseInt(part.value, 10);
  }
  const asUTC = Date.UTC(map.year, map.month - 1, map.day, map.hour % 24, map.minute, map.second);
  return asUTC - at.getTime();
}

// Convert a wall-clock "HH:MM" on the local calendar day of `dayRef` (in timeZone)
// into the corresponding UTC instant. Two-step DST-safe conversion: treat the wall
// time as UTC, then correct by the zone's offset at that instant.
function localWallTimeToUtc(dayRef: Date, timeZone: string, hhmm: string): Date {
  const ymd = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(dayRef);
  const [y, m, d] = ymd.split('-').map(Number);
  const [hh, mm] = hhmm.split(':').map(Number);
  const guess = new Date(Date.UTC(y, m - 1, d, hh, mm));
  return new Date(guess.getTime() - tzOffsetMs(timeZone, guess));
}

// How much free runway is there right now? Looks ~6h ahead and reports whether we're
// free this instant and how many minutes until the next appointment starts.
// minutesUntilNextBusy is null when nothing is scheduled in the horizon (wide open).
// Fallback on auth failure: assume free with an unknown horizon.
export async function getMinutesUntilNextBusy(
  accessToken: string,
  refreshToken: string,
  userId: string
): Promise<{ freeNow: boolean; minutesUntilNextBusy: number | null }> {
  return withFreeBusyAuth(
    accessToken,
    refreshToken,
    userId,
    { freeNow: true, minutesUntilNextBusy: null },
    async (client) => {
      const now = new Date();
      const horizon = new Date(now.getTime() + 6 * 60 * 60000);
      const busy = await queryBusy(client, now, horizon);

      const freeNow = !busy.some((b) => b.start <= now && b.end > now);
      const upcoming = busy
        .filter((b) => b.start > now)
        .sort((a, b) => a.start.getTime() - b.start.getTime());
      const minutesUntilNextBusy = upcoming.length
        ? Math.round((upcoming[0].start.getTime() - now.getTime()) / 60000)
        : null;

      return { freeNow, minutesUntilNextBusy };
    }
  );
}

// Density of a clinic day: busy minutes inside the clinic window divided by the
// window length. ratio >= 0.8 is treated as a "full" clinic day. clinicStart/End are
// local wall-clock "HH:MM" (TIME columns also accept "HH:MM:SS"); the window is
// resolved in the user's timeZone so the math is DST-correct.
export async function getDayDensity(
  accessToken: string,
  refreshToken: string,
  userId: string,
  date: Date,
  timeZone: string,
  clinicStart: string,
  clinicEnd: string
): Promise<{ ratio: number; isFull: boolean; busyMinutes: number; windowMinutes: number }> {
  const windowStart = localWallTimeToUtc(date, timeZone, clinicStart);
  const windowEnd = localWallTimeToUtc(date, timeZone, clinicEnd);
  const windowMinutes = Math.max(0, Math.round((windowEnd.getTime() - windowStart.getTime()) / 60000));

  return withFreeBusyAuth(
    accessToken,
    refreshToken,
    userId,
    { ratio: 0, isFull: false, busyMinutes: 0, windowMinutes },
    async (client) => {
      const busy = await queryBusy(client, windowStart, windowEnd);
      let busyMs = 0;
      for (const b of busy) {
        // Clamp each slot to the clinic window — slots can overhang the edges.
        const s = Math.max(b.start.getTime(), windowStart.getTime());
        const e = Math.min(b.end.getTime(), windowEnd.getTime());
        if (e > s) busyMs += e - s;
      }
      const busyMinutes = Math.round(busyMs / 60000);
      const ratio = windowMinutes > 0 ? busyMinutes / windowMinutes : 0;
      return { ratio, isFull: ratio >= 0.8, busyMinutes, windowMinutes };
    }
  );
}

// Where is Ladd right now relative to his patient sessions? This is the calendar
// half of the choreographer's "which beat" decision. Reads actual TIMED events
// (all-day markers like "OOO"/vacation are ignored — they don't mean "in session").
// Looks back 4h so a long in-progress block is fully captured, and 6h forward.
export interface CalendarMoment {
  freeNow: boolean;
  inSession: boolean;
  minutesUntilSessionEnds: number | null; // set when inSession
  gapAfterSession: number | null; // free minutes opening when the current session ends; null = open-ended
  minutesUntilNextBusy: number | null; // set when free; null = nothing scheduled in horizon
  currentTitle: string | null; // title of the event in progress (context for the brain)
  nextTitle: string | null; // title of the next upcoming event
}

export async function getCalendarMoment(
  accessToken: string,
  refreshToken: string,
  userId: string
): Promise<CalendarMoment> {
  const fallback: CalendarMoment = {
    freeNow: true,
    inSession: false,
    minutesUntilSessionEnds: null,
    gapAfterSession: null,
    minutesUntilNextBusy: null,
    currentTitle: null,
    nextTitle: null,
  };

  return withFreeBusyAuth(accessToken, refreshToken, userId, fallback, async (client) => {
    const now = new Date();
    const lookback = new Date(now.getTime() - 4 * 60 * 60000);
    const horizon = new Date(now.getTime() + 6 * 60 * 60000);
    const events = (await queryEvents(client, lookback, horizon))
      .filter((e) => !e.allDay)
      .sort((a, b) => a.start.getTime() - b.start.getTime());

    const current = events.find(
      (e) => e.start.getTime() <= now.getTime() && e.end.getTime() > now.getTime()
    );
    if (current) {
      const minutesUntilSessionEnds = Math.max(
        0,
        Math.round((current.end.getTime() - now.getTime()) / 60000)
      );
      const next = events.find((e) => e.start.getTime() >= current.end.getTime());
      const gapAfterSession = next
        ? Math.max(0, Math.round((next.start.getTime() - current.end.getTime()) / 60000))
        : null; // open-ended after this session
      return {
        freeNow: false,
        inSession: true,
        minutesUntilSessionEnds,
        gapAfterSession,
        minutesUntilNextBusy: null,
        currentTitle: current.title,
        nextTitle: next?.title ?? null,
      };
    }

    const upcoming = events.filter((e) => e.start.getTime() > now.getTime());
    const minutesUntilNextBusy = upcoming.length
      ? Math.round((upcoming[0].start.getTime() - now.getTime()) / 60000)
      : null;
    return {
      freeNow: true,
      inSession: false,
      minutesUntilSessionEnds: null,
      gapAfterSession: null,
      minutesUntilNextBusy,
      currentTitle: null,
      nextTitle: upcoming[0]?.title ?? null,
    };
  });
}

// Coarse window situation the brain uses to pick a beat:
//   prime       — in a session ending soon, with a usable gap after  → send a "get ready"
//   open        — free now, bounded usable window before next session → go / check
//   wide_open   — free now, nothing scheduled (evening / weekend)      → go / check, bigger work ok
//   mid_session — in a session, not ending soon                        → stay silent
//   no_window   — free or ending soon, but the window is too short     → stay silent
export type WindowSituation = 'prime' | 'open' | 'wide_open' | 'mid_session' | 'no_window';

export function classifyWindow(
  m: CalendarMoment,
  opts: { primeLeadMin?: number; minWindowMin?: number } = {}
): WindowSituation {
  const primeLeadMin = opts.primeLeadMin ?? 12;
  const minWindowMin = opts.minWindowMin ?? 5;

  if (m.inSession) {
    if (m.minutesUntilSessionEnds != null && m.minutesUntilSessionEnds <= primeLeadMin) {
      if (m.gapAfterSession == null || m.gapAfterSession >= minWindowMin) return 'prime';
      return 'no_window';
    }
    return 'mid_session';
  }
  if (m.minutesUntilNextBusy == null) return 'wide_open';
  if (m.minutesUntilNextBusy >= minWindowMin) return 'open';
  return 'no_window';
}

export async function hasEventNow(
  accessToken: string,
  refreshToken: string,
  userId: string
): Promise<boolean> {
  const oauth2Client = getOAuth2Client();
  if (!oauth2Client) {
    return false;
  }

  oauth2Client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
  });

  // Handle token refresh
  oauth2Client.on('tokens', async (tokens) => {
    if (tokens.access_token) {
      try {
        await supabase
          .from('users')
          .update({ google_calendar_token: tokens.access_token })
          .eq('id', userId);
      } catch (err) {
        console.error('[Google Calendar] Error updating token in DB:', err);
      }
    }
  });

  try {
    return await checkFreeBusy(oauth2Client);
  } catch (error) {
    console.error('[Google Calendar] Error checking free/busy:', error);
    // If token expired, try refreshing
    try {
      const newToken = await refreshAccessToken(refreshToken);
      if (newToken) {
        await supabase
          .from('users')
          .update({ google_calendar_token: newToken })
          .eq('id', userId);

        oauth2Client.setCredentials({
          access_token: newToken,
          refresh_token: refreshToken,
        });
        return await checkFreeBusy(oauth2Client);
      }
    } catch (retryError) {
      console.error('[Google Calendar] Retry failed:', retryError);
    }
    return false;
  }
}

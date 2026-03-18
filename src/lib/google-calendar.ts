import { google } from 'googleapis';
import { supabase } from '@/lib/db';

const SCOPES = ['https://www.googleapis.com/auth/calendar.freebusy'];

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
  // Check a 30-minute window: 5 min ago to 25 min from now
  // This catches events currently happening and ones about to start
  const windowStart = new Date(now.getTime() - 5 * 60000);
  const windowEnd = new Date(now.getTime() + 25 * 60000);
  const response = await calendar.freebusy.query({
    requestBody: {
      timeMin: windowStart.toISOString(),
      timeMax: windowEnd.toISOString(),
      items: [{ id: 'primary' }],
    },
  });

  const busySlots = response.data.calendars?.primary?.busy || [];
  const errors = response.data.calendars?.primary?.errors;
  if (errors && errors.length > 0) {
    console.error('[Google Calendar] FreeBusy API errors:', JSON.stringify(errors));
  }
  console.log(`[Google Calendar] FreeBusy check: ${busySlots.length} busy slots in window ${windowStart.toISOString()} - ${windowEnd.toISOString()}`);
  return busySlots.length > 0;
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

# CLAUDE.md

## Project Overview

**Goal App** — SMS-based goal tracking app with AI coaching. Next.js 16 + Supabase backend, deployed on Vercel. Users set up to 3 goals with subtasks, and Claude sends personalized SMS nudges via Twilio based on activity, schedule, and coaching style.

See `project_state.md` for current status and what's next.

## Architecture

```
src/
  app/
    page.tsx                          # Dashboard — goal list + meditation timer
    layout.tsx                        # Root layout (mobile-first meta)
    globals.css                       # Tailwind v4 + custom styles
    settings/page.tsx                 # Settings UI
    api/
      goals/route.ts                  # Goal CRUD (max 3 per user)
      goals/[id]/subtasks/route.ts    # Subtask CRUD
      goals/[id]/subtasks/summarize/  # AI subtask summary
      cron/check-goals/route.ts       # Hourly nudge cron (core logic)
      twilio/webhook/route.ts         # Inbound SMS → intent parse → action → reply
      auth/google/route.ts            # Google OAuth initiation
      auth/google/callback/route.ts   # Google OAuth callback
      user/settings/route.ts          # User settings GET/PATCH
      user/refine-prompt/route.ts     # AI prompt refinement
  components/
    GoalList.tsx                      # Main interactive component (drag/drop, inline edit, completion animations)
    MeditationTimer.tsx               # Popover timer with audio chimes
    PromptEditor.tsx                  # Custom coaching prompt editor with AI refinement
    Settings.tsx                      # Settings link/theme loader
  lib/
    claude.ts                         # Anthropic SDK — generateNudge, parseSmsReply, generateCoachingReply
    db.ts                             # Supabase client (service role key)
    google-calendar.ts                # Google Calendar free/busy check + token refresh
    prompts.ts                        # Default coaching prompt template (shared client/server)
    twilio.ts                         # Twilio SMS sender
  types/
    index.ts                          # TypeScript interfaces (User, Goal, Subtask, SmsConversation, ActivityLog)

supabase/migrations/
  20260214105117_create_tables.sql    # Initial schema (users, goals, subtasks, sms_conversations, activity_log)
  20260214120000_add_parent_id.sql    # Nested subtasks support
```

## Commands

```bash
npm run dev          # Next.js dev server (port 3002)
npm run build        # Production build
npm run lint         # ESLint
```

## Stack

- **Framework:** Next.js 16.1.6 (React 19, App Router)
- **Database:** Supabase (PostgreSQL) — direct client, no ORM
- **AI:** Anthropic Claude SDK (`claude-sonnet-4-5-20250929`)
- **SMS:** Twilio (bidirectional — outbound nudges + inbound webhook)
- **Calendar:** Google Calendar API (OAuth, free/busy check)
- **Styling:** Tailwind CSS v4
- **IDs:** uuid v13

## Database

- **Provider:** Supabase (PostgreSQL)
- **Client:** `@supabase/supabase-js` with service role key
- **Tables:** `users`, `goals`, `subtasks`, `sms_conversations`, `activity_log`
- **Migrations:** `supabase/migrations/` — additive SQL files

## Deployment (Vercel)

- Vercel with Next.js framework preset
- **Cron:** `/api/cron/check-goals` runs daily at 12:00 UTC (configured in `vercel.json`)
- Cron protected by `CRON_SECRET` bearer token

## Key Env Vars

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase admin key |
| `ANTHROPIC_API_KEY` | Claude API for nudges + SMS parsing |
| `TWILIO_ACCOUNT_SID` | Twilio account |
| `TWILIO_AUTH_TOKEN` | Twilio auth |
| `TWILIO_PHONE_NUMBER` | Twilio sender number |
| `GOOGLE_CLIENT_ID` | Google OAuth |
| `GOOGLE_CLIENT_SECRET` | Google OAuth |
| `GOOGLE_REDIRECT_URI` | OAuth callback URL |
| `CRON_SECRET` | Cron job authorization |
| `NEXT_PUBLIC_APP_URL` | App base URL |

## Core Flow: SMS Coaching

1. **Cron** (`check-goals/route.ts`) runs hourly for each user
2. Hard checks: active hours → Google Calendar busy
3. Claude generates nudge or returns `SKIP: {reason}`
4. If not skipped, sends SMS via Twilio and logs to `sms_conversations` + `activity_log`
5. **Inbound SMS** (`twilio/webhook/route.ts`) parses intent via Claude (complete task, add subtask, etc.)
6. Executes database mutations, then sends coaching reply

## API Routes

| Route | Methods | Purpose |
|---|---|---|
| `/api/goals` | GET, POST, PATCH, DELETE | Goal CRUD (max 3) |
| `/api/goals/[id]/subtasks` | POST, PATCH, DELETE | Subtask management |
| `/api/goals/[id]/subtasks/summarize` | POST | AI subtask summary |
| `/api/cron/check-goals` | GET | Nudge cron job |
| `/api/twilio/webhook` | POST | Inbound SMS handler |
| `/api/auth/google` | GET | Google OAuth start |
| `/api/auth/google/callback` | GET | Google OAuth callback |
| `/api/user/settings` | GET, PATCH | User settings |
| `/api/user/refine-prompt` | POST | AI prompt refinement |

## Session Rules

See global session rules in ~/.claude/CLAUDE.md. Project-specific additions:
- Deploy: `npx vercel --prod` (GitHub → Vercel auto-deploy webhook is broken; manual deploy is always required)
- Verify: open https://goal-app-five-beta.vercel.app/ and confirm changes are visible before reporting done
- No testing framework — be careful with changes to API routes and lib functions

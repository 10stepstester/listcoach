# Project State

*Last updated: 2026-03-18*

## Current Status

The app is functional and deployed on Vercel at https://goal-app-five-beta.vercel.app/. All recent work is committed and deployed. The dashboard has two tabs: Raw To-dos (hierarchical, editable list) and Smart List (AI-prioritized flat list). Note: GitHub pushes do NOT auto-trigger Vercel deploys — must run `npx vercel --prod` manually after each push.

## What's Built

### Core Features (Committed)
- Initial Supabase schema: users, goals, subtasks, sms_conversations, activity_log
- Basic goal CRUD, subtask management, SMS webhook, cron nudge job
- Supabase + Twilio + Anthropic + Google Calendar integration

### Committed & Deployed (2026-03-18 session)
- **Smart List tab** — `/api/smart-list` route + `smart_list_items` table; AI prioritizes all raw to-dos into a flat ranked list
- **Smart List speed** — optimized from 39s → 2.3s: switched to `claude-haiku-4-5`, compact index-only output format, batch DB insert, pre-filter to leaf nodes only
- **Smart List refresh icon** — small ↻ icon on the Smart List tab (replaces bottom "Reorganize" button); spins while loading
- **Auto-regenerate** — smart list regenerates automatically on every add/edit/delete/toggle (no manual trigger needed)
- **Google Keep-style completion** — checked items move below a "Completed (N)" divider with 60% opacity; applied to both Raw and Smart List tabs
- **Vercel function timeout** — added `maxDuration: 60` for `smart-list` and `cron/check-goals` routes in `vercel.json`
- **Raw to-dos bulk add** — added 40+ new to-do items across categories: Website, Wellness Directory, Booking System, Openclaw, PF Course, Musclepractor, Other, Personal

### Previously Built (committed)
- **GoalList overhaul** — drag/drop reordering, inline editing, completion animations, fireworks, subtask nesting
- **MeditationTimer** — circular progress, audio chimes, configurable duration
- **Settings page** — `/settings` route with full settings UI
- **PromptEditor** — custom coaching prompt editor with AI refinement
- **Nested subtasks** — `parent_id` migration, updated subtask routes
- **AI subtask summarization** — `/api/goals/[id]/subtasks/summarize`
- **Cron improvements** — Google Calendar, timezone-aware active hours, AI SKIP logic
- **SMS webhook** — Claude-powered intent parsing
- **Vercel cron** — daily at 12 PM UTC

## What's Next

- **Smart List sync** — when raw to-do is deleted, remove it from smart_list_items too
- **Auth** — no user authentication on the web UI (API uses service role key directly)
- **Multi-user** — schema supports it, web UI is single-user (hardcoded user fetch)
- **Testing** — no test framework configured; consider adding Vitest
- **Error handling** — API routes have basic try/catch but no structured error responses

## Known Issues

- GitHub → Vercel auto-deploy webhook not working — must run `npx vercel --prod` after each push
- No `.env.example` file for onboarding
- `README.md` is still default Next.js boilerplate

## Schema

```
users: id, phone_number, timezone, nudge_style, active_hours_start/end, outcome_target,
       google_calendar_token/refresh_token, accent_color, dark_mode, custom_prompt

goals: id, user_id, title, position, is_active

subtasks: id, goal_id, parent_id (nullable), title, is_completed, completed_at, position

sms_conversations: id, user_id, direction, message_text, goal_context (JSONB), sent_at

activity_log: id, user_id, action_type, goal_id, subtask_id, timestamp
```

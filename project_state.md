# Project State

*Last updated: 2026-03-17*

## Current Status

The app is functional and deployed on Vercel. Core goal tracking, SMS coaching, and the web dashboard are working. There are significant uncommitted changes across 14 files plus 6 new untracked files/directories — this represents the bulk of the app's evolution since the initial commit.

## What's Built

### Core Features (Committed)
- Initial Supabase schema: users, goals, subtasks, sms_conversations, activity_log
- Basic goal CRUD, subtask management, SMS webhook, cron nudge job
- Supabase + Twilio + Anthropic + Google Calendar integration

### Recent Work (Uncommitted)
- **GoalList overhaul** — drag/drop reordering, inline editing, completion animations, fireworks, subtask nesting (~840 lines changed)
- **MeditationTimer** — rewritten with circular progress, audio chimes, configurable duration
- **Settings page** — new `/settings` route with full settings UI
- **PromptEditor** — custom coaching prompt editor with AI refinement endpoint
- **Nested subtasks** — `parent_id` migration, updated subtask routes
- **AI subtask summarization** — new `/api/goals/[id]/subtasks/summarize` endpoint
- **Cron improvements** — Google Calendar free/busy check, timezone-aware active hours, AI SKIP logic, conversation-aware nudges
- **SMS webhook upgrades** — Claude-powered intent parsing (complete, add, update goals via text)
- **Claude integration refactor** — template-based prompts with `{{placeholders}}`, custom prompt support
- **Vercel cron** — changed to daily at 12 PM UTC
- **User settings** — accent color, dark mode, custom prompt fields added to types

## What's Next

- **Commit and push** all uncommitted work
- **Testing** — no test framework configured; consider adding Vitest
- **Auth** — no user authentication on the web UI (API uses service role key directly)
- **Multi-user** — schema supports it, but the web UI is single-user (hardcoded user fetch)
- **Error handling** — API routes have basic try/catch but no structured error responses
- **Nested subtask UI** — parent_id migration exists but unclear if GoalList fully renders nested children

## Known Issues

- Large amount of uncommitted work — risk of losing changes
- No `.env.example` file for onboarding
- `README.md` is still the default Next.js boilerplate
- Screenshots and PDF files in project root should probably be in a docs folder or gitignored
- `DATABASE_PATH` env var in `.env.local` suggests an old SQLite path that may be vestigial

## Schema

```
users: id, phone_number, timezone, nudge_style, active_hours_start/end, outcome_target,
       google_calendar_token/refresh_token, accent_color, dark_mode, custom_prompt

goals: id, user_id, title, position, is_active

subtasks: id, goal_id, parent_id (nullable), title, is_completed, completed_at, position

sms_conversations: id, user_id, direction, message_text, goal_context (JSONB), sent_at

activity_log: id, user_id, action_type, goal_id, subtask_id, timestamp
```

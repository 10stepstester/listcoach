# Project State

*Last updated: 2026-03-18 (Session 3)*

## Current Status

The app is functional and deployed on Vercel at https://goal-app-five-beta.vercel.app/. All recent work is committed and deployed. The dashboard has two tabs: Raw To-dos (hierarchical, editable list) and Smart List (AI-prioritized flat list). Note: GitHub pushes do NOT auto-trigger Vercel deploys — must run `npx vercel --prod` manually after each push.

## What's Built

### Core Features (Committed)
- Initial Supabase schema: users, goals, subtasks, sms_conversations, activity_log
- Basic goal CRUD, subtask management, SMS webhook, cron nudge job
- Supabase + Twilio + Anthropic + Google Calendar integration

### Smart List Fix — Session 3 (2026-03-18)
- **is_completed sync on regeneration** — `insertReorganized` was hardcoding `is_completed: false` for all items, causing completed tasks to reappear as active every time the smart list regenerated. Fixed by adding `is_completed` to `ReorganizedItem` interface, propagating it from raw subtask leaf nodes in all return paths of `reorganizeTodos`, and using it in `insertReorganized` instead of the hardcoded value. Now completed items stay checked after refresh.

### Bug Fixes — Session 2 (2026-03-18)
- **Drag snap-back fixed** — added `console.log` to `handleDragEnd` for debugging, added revert-on-failure if PATCH errors, fixed long-press sheet firing mid-drag on mobile (useEffect cancels long-press timer when isDragActive becomes true)
- **Completed items at all nesting levels** — completed child tasks now move to the global "Completed (N)" section instead of staying inline under their parent. Active tree is built from non-completed items only. Completed section is collapsible (chevron toggle). Count reflects all completed subtasks at any depth. Unchecking an item returns it to its original parent position.
- **CompletedRow component** — simplified row for the completed section (no drag, no hover actions; just checkbox to uncheck + strikethrough title)

### Phase 1 — Committed & Deployed (2026-03-18)
- **Roboto font** — switched from Geist; category headers weight 500, tasks weight 400
- **Drag handles** — GripVertical (lucide-react) as the only drag activator per row; hover-reveal hidden during active drag
- **Collapsible categories** — chevron (›/▼) on category headers; collapse state in component memory
- **Category [+] button** — always visible on category headers (not hover-only)
- **Hover-reveal (desktop)** — + child, → move-to-category dropdown, × delete
- **Move-to-category dropdown** — lists all categories, updates parent_id + position via PATCH
- **Long-press bottom sheet (mobile)** — 500ms trigger; Edit / Move to... / Add item below
- **addSiblingSubtask** — "Add item below" in long-press sheet adds sibling at same level
- **Subtasks PATCH API** — added parent_id field support for move-to-category
- **DnD** — @dnd-kit; children in nested SortableContext per category; drag reorders within same parent; batch-PATCHes positions

### Previously Committed (2026-03-18 session)
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

- **Phase 2 (Session 3)** — SMS cron every 10 min (`*/10 * * * *`), focus mode commands, nudge logic overhaul with conversation context
- **Phase 3 (Session 4)** — claude.ts `generateNudge` refactor + prompts.ts focus-coach template
- **Smart List sync** — when raw to-do is deleted, remove it from smart_list_items too
- **Auth** — no user authentication on the web UI (API uses service role key directly)
- **Multi-user** — schema supports it, web UI is single-user (hardcoded user fetch)

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

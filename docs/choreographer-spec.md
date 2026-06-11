# Attention Choreographer — Spec & Build Plan

_Status: design agreed 2026-06-05; **built and live as of 2026-06-07**. This is the source
of truth; supersedes the original "capacity-matched nudge" Cowork prompt where they conflict._

## As-built status (live as of 2026-06-07)

The build shipped and went live — the 10-min cron-job.org job now points at
`/api/cron/choreographer`. Phases 1–5 **and GO-LIVE are complete.**

**Live (the actual system):**
- `choreographer.ts` + `/api/cron/choreographer` — the single live brain; one Sonnet call
  per 10-min tick (prime / go / check / silent).
- Calendar: scope upgraded to `calendar.readonly` (+ `gmail.readonly` bundled);
  `getCalendarMoment` / `classifyWindow` read real events.
- fasciachart reactivation: service-token auth → `GET /api/reactivation/top` + `log-contact`
  (real patient names/phones, e.g. "Text Janet Gose").
- `nudge_state` in-flight task memory (prime→go→check lifecycle). Big tasks are nudged in
  baby steps under the umbrella label; each beat stamps its micro-step on the row
  (`entity.current_step`) so replies are judged against the step, not the project
  (2026-06-10).
- Reply reactivity: `handleNudgeReply` + the webhook branch. Meanings: done (whole label) /
  step_done (one micro-step — task stays active) / deferred / declined / unrelated.
  Reactivation labels are atomic, so step_done normalizes to done there (keeps the
  fasciachart log-contact loop-close).
- Scribe durable memory (`scribe.ts`, 2026-06-10): fast path extracts facts from each
  inbound reply into the `facts` plan doc; nightly Vercel cron (`scribe-compact`, 3 AM UTC)
  compacts it. Inbound-only sourcing — bot texts are never a fact source.
- Clinic-turnover guard (2026-06-10): between back-to-back patients only a quick
  reactivation text is allowed — dev/ops nudges are hard-stopped in code.
- **Editable playbooks:** `plan_docs` table + `plan-store.ts` + the Settings editor +
  `/api/plan`. Editing a playbook in Settings changes nudges with **no deploy** — the
  `plan.ts` constants are only the fallback when a key hasn't been edited.

**Superseded / vestigial (still in the repo, NOT driving nudges):**
- `check-goals` route — the old brain, now fully orphaned: the ghost Vercel cron at
  12:00 UTC was removed from `vercel.json` on 2026-06-10. The route is dead code; nothing
  calls it.
- `morning-advisory` (6 AM) — still runs and writes `daily_advisory`, which nothing reads
  now. Wasted Sonnet call; otherwise harmless.
- `generate-plan.ts` + `plan_queue` / `day_type` writes — dormant, not wired to any cron. Inert.
- `clinic_days` / `clinic_start` / `clinic_end` columns — wrong (Ladd works Fridays) and
  unread; the live calendar is the source of truth for "am I in clinic."
- Capacity columns on `subtasks` (`est_minutes`, `lane`, `priority`, `is_emergency`) — inert.
  Kept because additive/harmless.

**Known open issues:**
- **Focus bar not honored.** `users.focus` (the bar under the tabs) is read only by the dead
  `check-goals` / `claude.ts` path — `choreographer.ts` never reads it. Typing a focus does
  nothing to live nudges. Fix: feed `user.focus` into the choreographer prompt as a
  top-priority override.
- ~~**Metered Stripe → resolved by v5 (2026-06-07).**~~ DONE: playbook v5 (flat ~$89/mo +
  tiers, organic + beta conversion, workshop Oct 17) is live in Settings and synced to the
  `plan.ts` fallback with `PLAN_START = 2026-06-13` (commits f3c1e74, 5c96989).
- ~~**DEV/OPS lane gap (new with v5).**~~ DONE 2026-06-07 (commit 5e6920e): lanes are now
  `reactivation`/`ops`/`dev` (legacy `practice` normalized to `ops` on read), CORE_SYSTEM
  ranks across all three per v5 §0, and the playbook is a first-class candidate source.
- Escalation-tone ("25 ignored / Answer NOW") — left as-is intentionally (Ladd wants it).

## What it is (one paragraph)

Not "smarter nudges from a to-do list." It's an **attention choreographer**: it watches the
shape of Ladd's day (from his calendar) and walks him through each real open window —
**get ready → do it now → did you do it?** — with short, specific texts. It protects
intentional time from low-value interrupts (a non-urgent email) and lets genuine
high-value ones through (a scheduling voicemail). The to-do list is fuel; the product is
the **timing**.

## Principles (definition of "good")

1. **One thing at a time, sized to the moment.** Never "do 45 min of X" when he has 2.
2. **Clinic day = clinic sips only; dev stays hidden until evening/weekend.**
3. **Silence is allowed and good.** A skipped nudge beats a bad one.
4. **Short texts.** No explaining *why* — the setup is intentional. "Text Janet Gose when
   you have a minute." → "You text Janet yet?" Reading time must be near-zero.
5. **Specific, not vague.** Real names and concrete next actions ("Janet Gose", a specific
   first step) — specificity is what makes a task feel un-overwhelming.
6. **Conversational & adaptive.** Replies reshape the next beat. "need to call a patient"
   → next text becomes "call done? now Janet." Reacts like a person, not a script.
7. **Nagging is fine *because it adapts*** — squeaky wheel gets the grease. The line
   between squeaky-wheel and broken-record is that it reads his replies and the calendar.
8. **Current names in user-facing text.** "chatwithmybody" (the dev #1 bet), never the old
   "nativehelix" — even though the list heading still says nativehelix.

## The two playbooks (fixed reference docs; the AI ranks against them)

- **PLAN_V4** (`src/lib/plan.ts`) — the locked 150-day **dev** strategy. chatwithmybody
  (formerly NativeHelix) is the #1 dev bet → its items rank first in the dev lane.
- **PLAN_PRACTICE** (`src/lib/plan.ts`) — the **clinic** operator cadence (reactivation
  first, then weekly patient email, content, referral coffees, reviews).

The AI is the **judge**, not the author: it sorts Ladd's real to-dos against these.

## Architecture

### ⚠️ Calendar scope must be upgraded (found in Phase 1 testing, 2026-06-05)
The app currently uses the **`calendar.freebusy`** scope — it sees only busy/free, not what
the busy *is*. Live test on a Friday showed one merged block 7:30am–3:00pm; freebusy can't
tell a blocked-out day from a real patient, and merges back-to-back visits into one block
(no per-appointment boundaries). The choreographer needs to **read events** to (a) ignore
all-day/long blocks, (b) see each appointment's real end so it can prime the gap after it,
and (c) optionally use titles ("Patient: …" vs "BLOCKED").
- **Decision: upgrade Google OAuth to `calendar.readonly`** (one-time re-auth). Bundle with
  the planned `gmail.readonly` scope so Ladd re-consents only once.
- The Phase-1 `getCalendarMoment` / `classifyWindow` helpers stay, but their internals move
  from freebusy to an events read once the scope lands. `hasEventNow` (freebusy) can remain.

### ✅ Calendar-read verified live (2026-06-05)
After the scope upgrade + re-auth, `events.list` works. Real data showed individual
appointments with names/durations (e.g. Mon: Steve Patterson 10:30–11:00, then a 2h gap
1:00–3:00) where freebusy had only shown one merged block. Confirms we can see session
boundaries, real gaps, and distinguish odd blocks (a 210-min event titled ".") from visits.
- **Finding: `clinic_days` default (Mon–Thu) is already wrong — Ladd sees patients Friday.**
  Don't trust a static clinic-days field; the live calendar is the source of truth for
  "am I in clinic." Plan to drop/ignore `clinic_days` in favor of reading events.

### Heartbeat — the 10-minute cron (most failsafe)
The 10-min external cron-job.org job is the heartbeat. **As built, it now points at
`/api/cron/choreographer`** (cut over from the retired `/api/cron/check-goals`). We do
**not** go to a 1–2 min cron or self-scheduling. Rationale: 30/60-min sessions on clean boundaries make
consecutive 10-min ticks fall naturally into prime → go → check; ±5 min is fine for
shepherding; and because **every tick re-reads reality from scratch, it self-heals** — a
missed beat is recovered on the next tick. A precise self-scheduled system is more fragile.

### Each tick is calendar-aware → picks a "beat"
On each tick the brain reads the calendar and classifies the current moment, then chooses:

- **PRIME** — currently in a session that ends in ≤~10 min, with free runway after.
  → "When you finish, take 2 min to text Janet Gose."
- **GO** — a free window just opened (session ended in the last ~10 min) and there's runway.
  → "Compose text to Janet right now."
- **CHECK** — assigned a task ~10+ min ago, still free, not confirmed done.
  → "You get that text sent to Janet?"
- **SILENT (SKIP)** — slammed (full day / mid-session with no gap), outside active hours,
  cooldown, or nothing worth saying. Say nothing.

This requires one small calendar helper addition: **"minutes until the *current* session
ends"** (we already have free/busy + "minutes until next session starts" via
`getMinutesUntilNextBusy` and `getDayDensity` from Phase 2).

### The brain — one Claude call per acting tick
Given everything below, decide the beat + the single task + a short text (or SKIP). This
replaces the brittle pre-computed `est_minutes`/tier machinery. The AI judges fit live, so
wrong stored estimates and list junk can't poison it (a smart picker ignores "Mirror").

Inputs to the brain each tick:
- Calendar state: in-session? ends in X min? free window of Y min? day type (full clinic /
  normal / evening / weekend).
- The two playbooks (PLAN_V4, PLAN_PRACTICE).
- The raw to-do list (messy, as-is — no cleanup required).
- The **in-flight task** (if any) + its beat stage.
- Recent SMS conversation (so replies reshape the next beat).
- **Top reactivation candidate from fasciachart** (name + phone + days-since-visit) when a
  practice/reactivation beat is in play.

### Timing & text rules (refined 2026-06-05 from walkthrough)

**Two clocks:**
- **Proactive beats fire on the 10-min cron grid** (:00, :10, :20, …). Prime/go/check all
  land on grid ticks — never off-grid scheduled times.
- **Replies get an instant answer** (off-grid, via the webhook). When Ladd texts back, the
  response is immediate and advances the chain.

**Text style (hard rules):**
- No preamble, no day-type ("clinic day"), no "why." Name + action only.
- No phone numbers — he texts from his own contacts, not copy-paste.
- As short as possible; reading time must be near-zero.

**Completion chains + escalating checks:**
- A "done" reply is acknowledged AND immediately presents the next item in the same lane:
  "Great — next is George Ruiz." Reactivation walks candidate → candidate.
- If Ladd goes quiet, successive cron ticks escalate tone:
  9:40 "Composing that one to George?" → 9:50 "What's going on — George get his text?"
- Each beat is one grid tick (~10 min apart): present → check → escalate.

Worked example (morning):
```
~7:20  "When you get a couple minutes today, send some reactivation texts — start with Janet Gose."
 9:20  "Wrapping up? Janet's up this next gap."          (prime)
 9:30  "Text Janet now."                                  (go)
 9:34  you: "done"
 9:34  "Great — next is George Ruiz."                      (instant, tees up next)
 9:40  "Composing that one to George?"                     (cron check)
 9:50  "What's going on — George get his text?"            (cron escalate)
```

### State — the "task in flight"
A small record so the choreographer can follow one task through prime → go → check and
adapt to replies. Fields (likely a `nudge_state` row or columns on a daily row):
`current_task`, `beat_stage` (primed/assigned/checking/done/dropped), `entity` (e.g. the
patient), `assigned_at`, `last_beat_at`. Inbound replies update this; the brain reads it.

### Reactivity — replies feed the state
`/api/twilio/webhook` already parses inbound SMS. Extend it to update the in-flight task
(done / snoozed / "doing something else first") so the next beat adapts conversationally.

## Data sources

- **Calendar** — Google free/busy on the Bookeo patient calendar (existing). Gives session
  boundaries + day density.
- **Lapsed patients** — **fasciachart**, which already has a tuned reactivation system:
  `GET /api/reactivation/patients` returns name, phone, email, last-visit date, days-since,
  and a ranking score. Deployed at `https://fasciachart.up.railway.app`.
  - **One change needed in fasciachart:** that endpoint requires a JWT login; add a
    shared-secret / API-key door (~20 lines) so listcoach's cron can call it with a token.
  - Going direct to Bookeo is a dead end — Bookeo returns bookings, **not** phone numbers;
    contact info lives in fasciachart.
  - Bonus loop: fasciachart logs outreach (sent/snoozed/rebooked) — when Ladd texts Janet,
    listcoach can POST it back so the clinic system knows.
- **To-do list** — listcoach goals/subtasks (existing).
- **Voicemail/email interrupts** — _later phase._ Voicemails arrive as emails. The **app**
  needs its own Gmail read access; it already has Google OAuth (calendar), so extend scope
  to Gmail read. Scheduling voicemail = top-priority interrupt that can preempt a beat; a
  non-urgent email should not. (Claude's session Gmail tools are NOT the app's access.)

## Privacy
Ladd is **not a covered entity** (cash-pay, not billing insurance), so full patient names
+ phones over SMS/Claude/Supabase are acceptable. Hygiene only: secrets in env, don't log
patient data.

## What we keep vs. drop from the original Cowork build

**Keep:**
- Phase 0 cron health check (done — both jobs green).
- Phase 1 migration (already applied; additive, harmless — we just won't lean on
  `est_minutes`/`priority` as rigid inputs).
- **Phase 2 calendar helpers** (`getMinutesUntilNextBusy`, `getDayDensity`) — the genuinely
  useful foundation. Add "minutes until current session ends."
- PLAN_PRACTICE + PLAN_V4 (the playbooks).

**Drop / de-emphasize:**
- The rigid `est_minutes` spreadsheet, lane/priority persistence "don't-clobber" dance, and
  the 5-tier capacity matcher. Replaced by live AI judgment per acting tick.
- Pre-computed `plan_queue` as the authority. (May keep a lightweight version for the
  future "tab", but the live brain is the decision-maker.)

## Build phases (re-sequenced)

1. ✅ **Calendar edge helper** — `getCalendarMoment`/`classifyWindow`, reads events.
2. ✅ **fasciachart door** — `requireServiceTokenOrAuth` + `GET /api/reactivation/top`
   (ranked) + open `log-contact`. Live on Railway; token in Railway + listcoach .env.local.
3. ✅ **In-flight task state** — `nudge_state` table (RLS on) + `nudge-state.ts` helpers.
4. ✅ **The brain** — `choreographer.ts` + `/api/cron/choreographer` (new endpoint, inert
   until cutover). Dry-run verified live. Playbooks prompt-cached.
5. ✅ **Reactivity** — `handleNudgeReply` + webhook branch (dormant until cutover).

### ✅ GO-LIVE (cutover) — done 2026-06-07, sending real SMS
- ✅ `FASCIACHART_API_URL` + `LISTCOACH_SERVICE_TOKEN` in listcoach Vercel env.
- ✅ Deployed (webhook reactivity + choreographer endpoint live).
- ✅ Live end-to-end test fired a real nudge.
- ✅ cron-job.org 10-min job switched `/api/cron/check-goals` → `/api/cron/choreographer`.
- ◐ Tuning from real texts is ongoing (tone is intentionally aggressive per Ladd).
- ⬜ **Decommission debt (deferred):** retire the leftover Vercel noon `check-goals` cron,
  the 6 AM `morning-advisory`, and the dormant `generate-plan` path. See As-built status.

### ⬜ Later
6. **Gmail interrupts** — scope already granted; scheduling-voicemail preempts a beat.
7. **The "tab"** — read-only UI of today's plan / current beat / what's eligible.

## Open questions / parked
- Exact storage shape for in-flight state (row vs columns) — decide at Phase 3.
- How aggressively GO/CHECK should re-offer after Ladd ignores a beat (decay rule).
- ~~Whether the morning advisory still sends a separate strategic SMS or folds into the brain.~~
  RESOLVED: the brain ignores `morning-advisory` output; it's now dead weight, slated for decommission.

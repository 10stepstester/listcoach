// =============================================================================
// plan.ts — The locked strategic plan (v4) that drives the morning advisory.
// =============================================================================
// This is the single source of truth the morning-advisory route reasons against
// to decide "the one text Ladd needs right now." The plan itself is LOCKED — do
// not re-plan in code. Real-world corrections go in PLAN_AMENDMENTS below (dated),
// so the advisory stays current without rewriting the locked artifact.
//
// PLAN_START is the plan's Week 1, Day 1. planWeek() maps today's date to the
// plan week number so the advisory can anchor to the right week.
// =============================================================================

export const PLAN_START = new Date('2026-05-28T00:00:00-05:00'); // Week 1, Day 1 (America/Chicago)

/**
 * Dated corrections to the locked plan. The advisory must treat these as
 * overriding the plan body where they conflict. Add a new line; never edit v4.
 */
export const PLAN_AMENDMENTS = `
- 2026-05-31 — CE / NCBTMB approved-provider status is NO LONGER a critical path item.
  Being an approved CE provider matters much less than v4 assumed. Therefore:
  (a) The Week-3 "CE renewal not submitted = path dead" hard-kill is REMOVED.
  (b) "Submit CE renewal" is no longer the Day-1 long pole — do not nag about it.
  (c) The workshop's hook shifts from "get your CEs in person" to the TECHNIQUE
      itself ("release frozen shoulders in 90 seconds, walk out worked on").
      CE credit, if available, is now a nice-to-have, not the value proposition.
`.trim();

/** Compute which plan week a given date falls in (Week 1 = days 1–7). */
export function planWeek(now: Date = new Date()): number {
  const ms = now.getTime() - PLAN_START.getTime();
  if (ms < 0) return 0; // before the plan started
  return Math.floor(ms / (7 * 24 * 60 * 60 * 1000)) + 1;
}

export const PLAN_V4 = `
# 150-Day Plan v4 — FINAL / EXECUTE

Founder: Dr. Ladd Carlston
Locked: 2026-05-28
Status: Final. No more synthesis. Execute.

## 1. The goal
By day 150 (~Oct 25, 2026):
- Workshop 1 net revenue: ~$5-6K (lands day 100-120)
- Path A MRR: $800-1,500 committed (6-10 practitioners avg $130-150/mo blended metered)
- Cumulative day-150 revenue: $6-8K
- Monthly run rate by month 5-6: $9-15K achievable

## 2. ICP (locked)
Path A — chatwithmybody: Solo non-MD functional/wellness practitioner. 0-3 years in practice.
Cash-pay only (NOT billing insurance). 5-30 clients/month. Currently using Calendly + Stripe +
notes — NOT yet on Practice Better. FMCA/NBHWC/IFMCP/ND newer grad/functional chiro/integrative nutritionist.
Path B — Workshop: Chiropractors doing soft-tissue work, certified in ART/Graston/RockTape/FAKTR,
within 500-mile radius of Kansas City.
Vocabulary (Path A): Always "clients," never "patients." "Stays in your lane," not "scope-of-practice."
"Protocols," not "treatment plans." "Cash-pay," not "out-of-network."

## 3. Pricing (locked)
Path A — metered: Founding cohort (first 5): $29/mo base + $5/active client, locked 12 months.
Standard launch: $49/mo base + $10/active client. "Active client" = >=1 chat in the billing period.
  5 clients = $99/mo standard ($54 founding) · 15 = $199 ($104) · 30 = $349 ($179)
Path B — Workshop: Standard $795 · Early-bird (first 6 seats, ends 21 days before) $595 ·
Payment plan 3 x $275 · Group 3+ from same clinic at $695 each.

## 4. Positioning (locked)
Path A hero: Modern client experience for cash-pay practitioners. AI intake. Smart dashboard.
Always-on support — for your client and you.
Path A subhead: Replace your intake form, your client dashboard, and ChatGPT — with one tool built
for your practice. Your AI stays in your lane. ChatGPT doesn't.
Path A killer feature: "Your client asks theirs. You ask yours. Both AIs know everything you've
told them — and nothing you haven't."
Path A founder framing: "Built by a working chiropractor for his own clients."
Path B hero: Release frozen shoulders in 90 seconds. Get your CEs in person — and walk out worked on.
Path B name: "The Muscle Reset Method — 90-Second Releases for Stuck Soft Tissue."

## 5. Hard constraints
20 hrs/week max (effective 16, 4 reserved buffer). $1,000 total seed. No contractors/team.
Clinic remains primary income, protected. Mind in Motion PA dissolution week (mid-June) — light load.
One mandatory off-week (week 6). 150 days total.

## 6. Modified hybrid (structural fix)
Only one path ACTIVE at a time; infrastructure builds in parallel.
- Weeks 1-7: Workshop is the active acquisition motion. Path A: build infra only (domains warming,
  list scraping, demo flow). NO active Path A campaigns.
- Weeks 8-12: Both paths active. Workshop final push. Path A begins cold email + first founding cohort.
- Weeks 13-15: Workshop is the focus. Workshop runs. Path A cold email continues automated.
- Weeks 16-22: Path A is the focus. All cold email + product polish into Path A.

## 7. Budget ($1,000)
Smartlead Starter $195 · Domains x3 $36 · Outlook x6 inboxes $135 · Apollo Basic $147 ·
Clay credits $149 · Legal consult $200 (healthtech attorney, state genetic privacy + T&C) ·
Workshop landing/Stripe $50 · KS CE filing $0 (from workshop revenue) · Buffer $88.
No paid ads. No organic IG paid boost. No contractors.

## 8. Cut and stays cut
Workshop #2 (deferred to 2027) · Path A paid ads · ungated free trial (7-day, card required) ·
organic IG engine (defer to week 14+) · redacted-real-client demo (use fictional "Sarah") ·
chatwithmybody rebrand (week 16-18 only, after 3 paying customers) · warm-intro motion (dead;
cold email only for Path A).

## 9. Beta cohort (Jerry, Joyce, Janet, etc.)
Week 4: one email to all beta users — convert to founding cohort ($29 + $5/active, locked 12 mo)
OR sunset in 30 days. Active responders -> testimonial requests (wk 5-8). Non-responders -> quiet
sunset. Total budget for this: 1 hour across 150 days. Do not let it eat more.

## 10. Week-by-week
Week 1 (May 28–Jun 3) Foundation: [CE renewal — see amendment, deprioritized] · reactivation texts
to lapsed clinic patients · register 3 alt domains + begin Smartlead warmup · lock workshop name on
musclereset.com · lock Path A hero copy on chatwithmydna.com (no rebrand) · begin Stripe metered billing.
Week 2 (Jun 4–10) Infra: build Path B list (1,000 ART/Graston/RockTape/FAKTR chiros, 500mi KC) ·
begin Path A list (1,500 newer cash-pay non-MD coaches) · write Path B sequence (4 touches/14 days) ·
write Path A sequence (store, don't send) · workshop landing page complete.
Week 3 (Jun 11–17) Workshop launch: domain warmup done, begin Path B cold email 30/day per inbox
(~90/day) · $200 attorney consult · Path A: don't touch · MIMPA dissolution admin (light).
Week 4 (Jun 18–24) Iterate: Path B up to 50/day per inbox if clean · first Path B registrations ·
beta cohort email sent · iterate Path B copy on first 500 sends.
Week 5 (Jun 25–Jul 1) Path B push: early-bird active · build fictional "Sarah" demo (4 hrs) ·
target 2-3 paid registrations.
Week 6 (Jul 2–8) MANDATORY OFF-WEEK: cold email automated, no new initiatives, recovery.
Week 7 (Jul 9–15) Workshop core: continue Path B · Path A infra check · target 4-5 paid.
Week 8 (Jul 16–22) Both active: Path B early-bird ends, final push · Path A cold email goes LIVE
25/day per inbox (150/day) · first Path A demos · workshop target 6-7 paid.
Weeks 9-11 (Jul 23–Aug 12) Push: both active · Day -21 from workshop (~Aug 15) go/no-go · if <8 paid,
downsize to 1-day intensive $295 in friendly clinic space · Path A target 1-2 founding seats.
Weeks 12-13 (Aug 13–26) Workshop runs: lands day 100-120 (target Aug 18-25) · capture testimonials +
raw video · Path A cold email automated, no new closes in workshop week.
Weeks 14-15 (Aug 27–Sep 9) Debrief + Path A focus: email attendees (thanks + community/recorded offer) ·
Path A becomes active focus, 4 founding seats by end wk 15 · begin video content from footage.
Weeks 16-18 (Sep 10–30) Path A core + rebrand: 6-8 customers cumulative ($800-1,200 MRR) ·
begin chatwithmybody.com rebrand · set up Stripe metered reporting.
Weeks 19-22 (Oct 1–24) Final push: Path A continues · day-150 metrics · decide Workshop 2 (Q1 2027) ·
rebrand complete.

## 11. Time allocation (16 hrs/week effective)
Wks 1-7: Path B 11h · Path A infra 3h · buffer 2h. Wks 8-12: Path B 8h · Path A 6h · buffer 2h.
Wks 13-15: workshop week = everything, then Path A ~12h. Wks 16-22: Path A 12h · rebrand 2h · buffer 2h.

## 12. Kill criteria
Hard kills: Any week clinic revenue >15% below baseline -> pause plan, refocus clinic. Week 5 workshop
<4 paid -> review copy, escalate referral incentive. Week 8 Path A reply rate <2% after 600+ sends ->
rewrite copy before scaling. Day -21 workshop <8 paid -> downsize to 1-day $295. Day -7 <6 paid on
downsized -> cancel + refund, reallocate to Path A. Day 90 (~Aug 26) $0 Path A MRR + <8 workshop regs ->
scope-cut to workshop-only. Day 45 mood check: sleep <6hrs x5 days / missed clinic / irritability ->
mandatory 2-week 8hr reduction.
[NOTE: the v4 Week-3 "CE renewal not submitted = path dead" hard-kill is REMOVED per 2026-05-31 amendment.]
Soft signals: practice numbers dropping in any 2-wk window -> reduce plan time 4h/wk toward clinic.
Reply rate wk4 <=1% -> stop volume, fix copy, restart. First demo conversion <20% by wk10 -> fix demo script.

## 14. Success criteria at day 150
Win: >=$5K workshop net + >=$1K Path A MRR + clear trajectory to $9K+/mo by month 6-7.
Acceptable: >=$3K workshop + >=$500 Path A MRR.
Pivot: <$3K workshop + <$300 MRR -> return to clinic-only through Q4, park chatwithmybody until 2027.

## 15. What this plan is NOT optimizing for
Not max-MRR. Not bulletproof. Not rebrand-first (branding waits for customer validation). Not
"follow your gut" (overrules warm-intro resistance; cold-only Path A makes the math work). It is the
most-likely-to-make-real-money-in-150-days plan given the constraints. Do not drift into re-planning.
`.trim();

// =============================================================================
// PLAN_PRACTICE — the practice-lane principle (operator cadence).
// =============================================================================
// PLAN_V4 above is the DEV principle (what to build, chatwithmybody first).
// PLAN_PRACTICE is the PRACTICE principle: the recurring operator work that keeps
// the clinic — the protected primary income — healthy. generatePlan reasons against
// BOTH: dev items ranked by v4, practice items ranked by this cadence.
// =============================================================================
export const PLAN_PRACTICE = `
# Practice operator cadence — the practice lane

The clinic is the protected primary income (see v4 §5). Practice-lane work is the
recurring, relationship-driven cadence that keeps it full. These are mostly small,
high-leverage touches — not deep work. Rank them by revenue-protection and recency:

- Reactivation / patient check-ins: text or call lapsed patients. Highest-leverage
  practice action — a recovered patient beats a cold lead. Do these first.
- Weekly patient email: one broadcast to the ~1,000-person list (Constant Contact).
  Keeps the practice top-of-mind; ship it on cadence, don't let it slip a week.
- Social content: short, consistent posts. Volume over polish. Defer if clinic-heavy.
- Referral coffees: in-person relationship building with referral sources. Schedule,
  don't improvise — these need a real time block.
- GBP / reviews: keep the Google Business Profile fresh; ask happy patients for reviews.

Practice items are the default lane for anything under the "Sprint" anchor or a parent
named for a practice activity (reactivation, patient, email, social, referral, reviews).
They should fit the gaps of a clinic day — micro-tasks between patients — not compete
with deep dev blocks.
`.trim();

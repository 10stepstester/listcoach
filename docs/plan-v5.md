# 150-Day Playbook — chatwithmybody (primary) + Muscle Reset Workshop

LLM-optimized playbook, **v5** — successor to "150-Day Plan v4." Restructured 2026-06-07 (see §9 Amendments).
Founder: Dr. Ladd Carlston. Plan start = **2026-06-13 (Sat) = Week 1**. Day 150 ≈ **2026-11-10**.
**Workshop event = Sat Oct 17, 2026.** Status: execute. No re-planning.

---

## 0. How to use this doc (read first)

- **Scope:** Pick the **single highest-leverage task** to nudge during a work window. Two lanes: **[DEV]** (software in Claude Code) and **[OPS]** (marketing/admin/content). Rank across both.
- **You are told the current plan week externally.** Map it to a phase (§2), then rank tasks (§3) against the current window length.
- **The #1 bet is `chatwithmybody`** (renamed from `chatwithmydna`; broader than DNA). The Muscle Reset Workshop is a **late, secondary** event (Oct 17) — the founder's most fulfilling project, and the one whose *only* past failure was marketing, so protect the workshop **marketing** when time is tight.
- **Channel rule (locked):** chatwithmybody is acquired via **organic content + converting existing beta users** — NOT cold email. **Cold email is reserved entirely for the workshop.**
- §8 (Reference) is **context, not tasks** — never nudge it.

### Nudge decision procedure
1. Map current week → phase (§2).
2. **Trigger override (§7):** if a kill/pivot/downsize trigger has fired, apply it FIRST.
3. **Read the window length** and match task size:
   - **≤45 min (weekday sliver):** small OPS action, content step, or a tightly-scoped DEV sub-step. Never push a deep build into a tiny window.
   - **Multi-hour / weekend block:** the highest-priority deep DEV build.
4. Within the active phase, walk both lane stacks (§3). Nudge the highest item that is (a) unblocked (§5), (b) not done, (c) fits the window. **Tag it [DEV] or [OPS].**
5. **Deadline override (§6):** anything past-due or due within 7 days jumps to top.
6. **Default tie-break:** revenue-blocking > launch-blocking > polish. Path A outranks the workshop **except** when a workshop deadline is imminent.

---

## 1. The goal (day 150)
- Path A (chatwithmybody) MRR = leading metric: $800–1,500 committed (6–10 practitioners).
- Workshop net ~$5–6K (Oct 17 event).
- Cumulative day-150 revenue: $6–8K.
- Run rate by month 5–6: $9–15K achievable.

---

## 2. Phase lookup (week → dates → motion)

| Phase | Weeks | Dates | Motion | Default focus |
|---|---|---|---|---|
| **1 — Build & convert beta** | 1–5 | Jun 13 – Jul 17 | Path A active | Rebrand + flat billing, convert beta users, start organic |
| **2 — OFF (vacation)** | 6 | Jul 18 – 24 | Automated only | Recovery (vacation block Jul 18–25). Suppress nudges. |
| **3 — Scale Path A + build workshop pipeline** | 7–12 | Jul 25 – Sep 4 | Path A primary | Organic engine + product polish; build workshop machinery |
| **4 — Workshop outreach live + Path A** | 13–18 | Sep 5 – Oct 16 | Both (Path A primary) | Workshop cold email live; Path A organic continues |
| **5 — Workshop runs + final push** | 19–22 | Oct 17 – Nov 13 | Workshop event → Path A | Run Oct 17, debrief, final Path A push, metrics |

Weeks run Sat–Fri. Workshop Oct 17 = day ~126. Day 150 ≈ Nov 10 (W22).

---

## 3. Ranked task stacks by phase (both lanes)

### Phase 1 — Build & convert beta (W1–5, Jun 13 – Jul 17)
Motion: Path A primary. Rebrand, build flat billing, convert beta users, start organic. Workshop: warm infra only.

**[DEV]**
- **P1 — Rebrand `chatwithmydna` → `chatwithmybody`** (domain + naming/copy across the existing app). Immediate, ungated. Live by ~Jun 26.
- **P2 — Flat billing + client-count tiers** (Stripe). Base ~$89/mo + tier plans by active-client count, soft cap. Simple plan-selection, NOT live usage metering. Needed to bill beta converts.
- **P3 — Compliance/infra hygiene:** apex domain → `https://` + HSTS (quick); geo-gate smoke test (assert the WA/NV block fires, so the false-alarm grep problem can't recur). Decide on Dockerfile commit `7782d7c` (lean revert if it changed build behavior; keep if inert).
- **P4 — Repurpose demo / "Sarah"** for beta onboarding + content (lower priority now — it was built for cold-email demos that no longer exist).

**[OPS]**
- **P1 — Convert beta cohort (Jerry/Joyce/Janet) → founding customers.** Fastest revenue, and the real per-active-client **token-cost data** that sets the tier prices. If they won't pay, that's the cheapest possible signal (see §7).
- **P2 — Start practitioner-targeted organic content** (build-in-public: "chiropractor who built his own AI tools, here's how I run a cash-pay practice"). Slow burn — start now. Measure practitioners who DM/sign up, not views.
- **P3 — Reactivation texts** to lapsed clinic patients (clinic cash, sliver-window task).
- **P4 — Build workshop chiro list + begin warming Google Workspace inboxes** (for Phase 4 outreach). Parallel ops.
- **Legal (mostly not your keyboard):** Anthropic DPA; confirm with attorney whether the WA geo-gate obviates the WA-specific privacy policy or just backstops it; **MIMPA dissolution (mid-June — hard legal deadline, don't let the build crowd it out).**

### Phase 2 — OFF (W6, Jul 18–24; vacation block Jul 18–25)
- Pre-schedule organic content. No new initiatives. Recovery. Suppress nudges (emergencies only).

### Phase 3 — Scale Path A + build workshop pipeline (W7–12, Jul 25 – Sep 4)
Motion: Path A primary (organic + convert inbound). Build workshop machinery in parallel.

**[DEV]**
- **P1 — Path A product polish** (retention/conversion) from beta feedback.
- **P2 — Workshop landing + Stripe** (4 tiers). Pre-build; due before W13 outreach.
- **P3 — Integrations groundwork** (the "interfaces with their workflow" piece that unlocks the $199+ premium tier later). Only if core is solid and you're ahead.

**[OPS]**
- **P1 — Organic content engine:** consistent practitioner-targeted posting; convert inbound interest. This is Path A's acquisition workhorse.
- **P2 — Finalize workshop chiro list; finish inbox warmup; write workshop cold-email sequence** (4 touches / 14 days).
- **P3 — Testimonials** from beta/founding customers.

### Phase 4 — Workshop outreach live + Path A continues (W13–18, Sep 5 – Oct 16)
Motion: Path A organic continues; workshop cold email goes live and intensifies into Oct 17.

**[DEV]**
- **P1 — Ship workshop landing + Stripe** if not done. **HARD: live before workshop outreach (W13).**
- **P2 — Workshop 1-day downsize variant** (contingent — only if go/no-go triggers, §7): simpler landing + $295 checkout.
- **P3 — Path A polish** continues.

**[OPS]**
- **P1 — Workshop cold email LIVE** (~W13). Early-bird active (first 6 seats $595, ends Sep 26).
- **P2 — Path A organic continues.**
- **P3 — Workshop go/no-go Sep 26** (W16): <8 paid → downsize to 1-day $295.

### Phase 5 — Workshop runs + final push (W19–22, Oct 17 – Nov 13)
Motion: Workshop event Oct 17, then Path A final push + metrics.

**[DEV]**
- **P1 (W19)** — keep everything live; minimal dev.
- **P2 (W20–22)** — Path A polish; begin integration work if Path A has proof.

**[OPS]**
- **P1 (W19)** — run workshop Oct 17; capture testimonials + raw video. No new Path A pushes event week.
- **P2 (W20)** — workshop debrief email to attendees.
- **P3 (W20–22)** — Path A organic continues + content from workshop footage; explore B2B/white-label only if Path A has paying-customer proof (§8).
- **P4 (~Nov 10)** — day-150 metrics + Workshop 2 (Q1 2027) decision.

---

## 4. Build deliverables (flat checklist)
- [ ] **[DEV]** Rebrand chatwithmydna → chatwithmybody — Phase 1, by ~Jun 26
- [ ] **[DEV]** Flat billing + client-count tiers (Stripe) — Phase 1, before billing beta converts
- [ ] **[DEV]** Apex → https + HSTS; geo-gate smoke test — Phase 1, sliver window
- [ ] **[OPS]** Convert beta cohort → founding customers — Phase 1
- [ ] **[OPS]** Organic content engine started — Phase 1, ongoing
- [ ] **[OPS]** Workshop chiro list built + GW inboxes warming — Phases 1–3
- [ ] **[DEV]** Path A product polish — Phases 3–5
- [ ] **[DEV]** Workshop landing + Stripe (4 tiers) — by ~Sep 4
- [ ] **[OPS]** Workshop cold email LIVE — Phase 4, ~W13
- [ ] **[DEV]** Workshop 1-day downsize variant — Phase 4, contingent
- [ ] **[OPS]** Run workshop — Oct 17
- [ ] **[DEV]** Integrations groundwork (premium-tier unlock) — Phase 3+ if ahead

**Compliance — DONE & verified on production (chatwithmydna.com):** full patient deletion (wipes chat data, retains consent records 7 yrs) · 12-month auto-delete job · WA/NV geo-gate blocking those residents at intake. *(These were the must-fix-before-first-customer blockers — now closed.)*

---

## 5. Dependencies (X blocks Y)
- Flat billing → **blocks billing beta converts** (Phase 1).
- Rebrand → should **precede outreach/content using the name** (soft).
- Compliance fixes → **DONE** (no longer blockers).
- Workshop landing + Stripe → **blocks workshop outreach** (W13). Due ~W12.
- Workshop list + warmed GW inboxes → **blocks workshop outreach** (W13).
- Integrations + proven daily client usage → **gate the $199+ premium repricing and the B2B/white-label motion.**

---

## 6. Hard deadlines (dated)

| Date | Deliverable | Blocks |
|---|---|---|
| **mid-June** | MIMPA entity dissolution (legal) | — (hard legal deadline) |
| **~Jun 26** (end W2) | Rebrand to chatwithmybody live | name consistency |
| **Phase 1** | Flat billing live | billing beta converts |
| **W6** (Jul 18–24) | OFF — vacation block Jul 18–25 | — |
| **~Sep 4** (end W12) | Workshop landing + Stripe live; chiro list + GW inboxes ready | workshop outreach (W13) |
| **~Sep 5** (W13) | Workshop cold email LIVE; early-bird opens | — |
| **Sep 26** (W16) | Workshop go/no-go (day -21). <8 paid → downsize 1-day $295 | workshop format |
| **Oct 10** (W18) | Downsized day -7 check. <6 paid → cancel + refund | workshop go/cancel |
| **Oct 17** (W19) | Workshop runs | — |
| **~Nov 10** (W22) | Day-150 metrics + Workshop 2 decision | — |

---

## 7. Kill / pivot / downsize triggers
Apply BEFORE ranking. A fired trigger can reorder or cancel a whole lane/path.

### Hard overrides
- **Clinic revenue >15% below baseline (any week)** → PAUSE the plan, refocus clinic. Stop nudges. Clinic is primary income, protected.
- **Beta conversion fails (e.g., 0 of 3 beta users pay)** → STOP before investing more in Path A; re-examine value, price, or ICP. This is the cheapest early signal — treat it as a gate, not a footnote.
- **Day 90 (~Sep 11): $0 Path A MRR** (no beta converts, no organic-driven signups) → serious Path A review (offer / pricing / channel). Path A is the primary bet, so this is red-alert, not abandon.
- **Workshop day -21 (Sep 26): <8 paid** → DOWNSIZE to 1-day intensive $295.
- **Workshop day -7 (Oct 10, downsized): <6 paid** → CANCEL + refund. Reallocate all workshop ops to Path A.
- **Day 150: pivot tier (<$300 MRR + <$3K workshop)** → clinic-only through Q4, park chatwithmybody until 2027.

### Channel-health signals (Path A is organic now)
- Organic gets **zero practitioner traction** over a sustained run (reassess by ~day 90): the channel or the content angle is wrong — fix the angle (more practitioner-specific, less general-wellness) before concluding the product is the problem.

### Capacity guard
- **Day 45 (~Jul 28) mood check:** sleep <6 hrs ×5 days / missed clinic / irritability → mandatory 2-week reduction to the low end of capacity.
- Cap: **20 hrs/wk max, ~16 effective sustainable, weekend-loaded.** Never nudge past it.

---

## 8. Reference context (not nudge-able)

### Product — the #1 bet
`chatwithmybody` (renamed from `chatwithmydna`; broader than DNA). An **AI client-knowledge layer** over genomic + health data: AI intake, smart dashboard, always-on AI support for client and practitioner. Killer feature: "Your client asks theirs. You ask yours. Both AIs know everything you've told them — and nothing you haven't."

### Market position (why the pricing/positioning is what it is)
- Incumbents (Jane / Practice Better / Healthie, ~$35–155/mo) are the **practice-management backbone** — scheduling, charting, billing, telehealth, portal. Their AI is a **scribe for the practitioner**, not a client-facing assistant.
- chatwithmybody is a **different category**: a client-facing conversational AI over the client's own data — the "Google Drive for a client's health stuff," queryable by both sides. That's white space the PM systems don't occupy.
- Your ICP is **not yet on a PM system** (Calendly + Stripe + notes), so you're not fighting Practice Better — you may be their *first* client system. Anchor to practice-software pricing, not toy pricing.
- The "interfaces with their workflow" (integrations) piece is the hard, expensive part that *earns* premium pricing — it's a later milestone, not v1.

### Pricing (locked direction; numbers finalize from beta)
- **chatwithmybody:** base **~$89/mo + client-count tiers** (tier sizes/prices set from beta token-cost data; revenue/active-client ≥ ~3–5× measured token cost). Founding cohort (first 5): locked rate, 12 months. Premium-tool positioning now; **path to $199+ once integrated and daily-usage proven.** No usage metering — tiers only. (White-label deferred; not v1.)
- **Workshop (Path B):** standard $795 · early-bird $595 (first 6 seats, ends Sep 26) · plan 3×$275 · group 3+ $695 ea. Downsized fallback = 1-day $295.

### ICP
- **Path A:** solo non-MD functional/wellness practitioner, 0–3 yrs, cash-pay only, 5–30 clients/mo, on Calendly + Stripe + notes (NOT on Practice Better). Vocabulary: "clients" not "patients," "stays in your lane" not "scope-of-practice," "protocols" not "treatment plans," "cash-pay" not "out-of-network."
- **Path B:** chiros doing soft-tissue work, ART/Graston/RockTape/FAKTR-certified, within 500 mi of KC.

### Positioning
- Path A hero: "Modern client experience for cash-pay practitioners. AI intake. Smart dashboard. Always-on support — for your client and you."
- Path A subhead: "Replace your intake form, your client dashboard, and ChatGPT — with one tool built for your practice. Your AI stays in your lane. ChatGPT doesn't."
- Path A founder framing: "Built by a working chiropractor for his own clients."
- Path B name: "The Muscle Reset Method — 90-Second Releases for Stuck Soft Tissue."
- Path B hero `[DRAFT — finalize]`: "Release frozen shoulders in 90 seconds. Learn it hands-on — and walk out worked on." (No CE offered. CE is *available* later by partnering with a local PACE provider — e.g., Cleveland University–KC — which auto-qualifies in KS/MO/NE/ID and 30+ states; becoming a PACE provider yourself is $2K/yr and not worth it for one workshop. Not pursued for v1.)

### Budget cap ($1,000) — revised
Cold email is workshop-only now; organic Path A costs ~$0 in tools, freeing budget.
- Smartlead $195 (workshop) · domains ~$24 · Google Workspace inboxes ×3–4 via reseller ~$20 · Apollo (chiro list) $147 · legal earmark $200 (DPA / WA policy) · workshop landing/Stripe $50 · **buffer ~$360** (was tight; freed by dropping 6 retail Outlook inboxes and second campaign's list tooling).
- Cut: paid ads, contractors, Clay (one small list doesn't need it), white-label v1.

### Capacity — realistic windows (weekend-loaded)
- Weekday mornings (pre-clinic): 30–45 min, fragmented → small OPS / content / scoped DEV sub-step.
- Weekday mid-day: occasional ~30 min → quick OPS / unblock.
- Weekday evenings (7–10pm): off-and-on, family-dependent → medium DEV or OPS.
- Weekends: 15–20 hrs when pushing → main deep-build block; reserve hard builds here.
- Founder runs ~80-hr total weeks (clinic + build); cap the *plan* at 20/16 effective.

### Beta cohort (Jerry, Joyce, Janet, etc.)
Phase 1: one email — convert to founding rate (locked 12 mo) or sunset in 30 days. This is now the **#1 near-term revenue + pricing-data move**, not a footnote. Responders → testimonials.

### Success criteria (day 150)
- **Win:** ≥$1K Path A MRR + ≥$5K workshop net + trajectory to $9K+/mo by month 6–7.
- **Acceptable:** ≥$500 MRR + ≥$3K workshop.
- **Pivot:** <$300 MRR + <$3K workshop → clinic-only through Q4, park chatwithmybody until 2027.

### Cut and stays cut
Workshop #2 (→2027) · Path A paid ads · Path A cold email (organic only) · usage-metered billing (flat + tiers only) · white-label v1 · ungated free trial · warm peer-network intros (no peer network — beta + organic instead).

### B2B / white-label (phase-2, after proof)
Sellable asset is the **validated clinical-judgment pipeline over genomic + health data**, NOT the chat (chat is commoditized in 2026). Pitch partners "I have the hard part you don't want to build," not "I have a chatbot." Slow partnership motion — only after paying-customer proof.

### What this plan is NOT optimizing for
Not max-MRR. Not bulletproof. It is the most-likely-to-make-real-money-in-150-days plan given the constraints. Do not drift into re-planning.

---

## 9. Amendments log
- **2026-05-31:** CE renewal deprioritized; v4 Week-3 CE hard-kill removed.
- **2026-06-06:** Start → Jun 13; workshop fixed to Oct 17; sequencing inverted (Path A primary, workshop late/secondary); CE dropped for v1; rebrand made immediate/ungated; vacation off-week W6; OPS lane added.
- **2026-06-07 (this version):**
  - **Path A channel = organic content + beta conversion; cold email is workshop-only.** (Founder has no peer network; organic plays to his content strength; frees infra/budget; eliminates the two-campaign deliverability problem.)
  - **Metered billing killed → flat base (~$89/mo) + client-count tiers**; numbers finalized from beta token-cost data; premium-tool positioning with headroom to $199+ after integrations + proven usage.
  - **Sending infra → all Google Workspace, ~3–4 warmed inboxes** (one campaign), via reseller. Outlook dropped.
  - **Compliance shipped & verified** (deletion, 7-yr consent retention, 12-mo auto-delete, WA/NV geo-gate) — must-fix blockers now closed. Remaining: apex→https, geo-gate smoke test, Anthropic DPA, WA privacy policy (confirm vs geo-gate), MIMPA dissolution.
  - **Beta conversion elevated** to the #1 near-term revenue + pricing-data move and a kill-signal gate.
  - Market-position + B2B-moat context added.

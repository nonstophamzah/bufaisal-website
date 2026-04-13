# Bu Faisal — Claude Usage Audit & Agent-Readiness Plan

**Date:** April 12, 2026
**Scope:** How you're using Claude tools, what's broken, and what needs to happen before the appliance tracking agent can work.

---

## PART 1: HOW YOU'RE USING CLAUDE (AND WHAT'S WRONG)

### Current Workflow (Reconstructed from Evidence)

Based on your git history, settings files, and project structure, here's what you're actually doing:

1. **Claude Chat** — You think through features, ask questions, get code snippets
2. **Copy-paste** — You take code from Chat and paste it into Claude Code or your editor
3. **Screenshots** — You screenshot the app, paste into Chat to show Claude what's happening
4. **Claude Code** — You run it for file edits and builds, clicking "allow" on every permission prompt reactively
5. **Repeat** — Fix → screenshot → paste → explain → fix again

This loop has three fundamental problems:

**Problem 1: Context loss on every handoff.** Every time you switch from Chat to Code, you lose context. Chat doesn't know your file structure. Code doesn't know what Chat told you. You're the bridge between two tools that should be working together, and you're spending more time translating than building.

**Problem 2: No persistent project memory.** You had no CLAUDE.md file. That means every Claude Code session started cold — no knowledge of your stack, conventions, database schema, or business rules. Your settings.local.json shows the symptoms: 36 individually-allowed bash commands, including hardcoded API keys in permission strings, because you were approving things one at a time instead of setting up proper access.

**Problem 3: Reactive development pattern.** Your March 29 commit history tells the story perfectly — 15 commits in one day:
- "Fix Gemini AI: correct API key on Vercel"
- "Update Gemini model to gemini-2.0-flash"
- "Update Gemini model to gemini-2.5-flash"
- "Update Gemini model to gemini-2.5-flash-lite"
- "Fix category images: replace broken images"
- "Fix category cards: always visible"

That's not building. That's debugging in production. Each of those should have been caught before committing, but without tests or a clear system spec, you couldn't.

### What This Is Costing You

Conservative estimate: **60-70% of your Claude usage is friction, not features.** You're spending tokens re-explaining context, debugging things that tests would catch, and manually bridging two tools that should share state.

---

## PART 2: HOW TO USE CLAUDE EFFECTIVELY

### The New Stack

**Claude Code** = Your primary building tool. With the CLAUDE.md I created, it now has full project context on every session. Use it for all code changes, database work, and feature building.

**Claude Chat (claude.ai)** = Strategic thinking only. Use it when you need to:
- Design a system before building it (state machines, data models, business rules)
- Get a second opinion on architecture decisions
- Draft non-code documents (business plans, SOPs, process docs)

**Cowork** = File operations, documents, and tasks that don't need code context. Use it for reports, data analysis, document creation.

### The Right Workflow

**Before building anything new:**
1. Open Claude Chat
2. Describe the SYSTEM you want to build (not the code)
3. Get Claude to poke holes in it — edge cases, failure modes, missing states
4. Once the system design is solid, take that spec to Claude Code
5. Claude Code builds it with full context from CLAUDE.md

**For bug fixes:**
1. Open Claude Code directly (it has all the context now)
2. Describe the bug — no screenshots needed, Claude Code can read the actual files
3. Let it fix, test, and verify

**For iterations:**
1. Stay in Claude Code
2. Don't switch to Chat to "think about it" — Claude Code can think too
3. If you need to redesign something fundamental, THEN go to Chat for the system design

### Settings Cleanup

Your .claude/settings.local.json needs to be replaced. Instead of 36 individual bash permissions, use broader patterns:

```json
{
  "permissions": {
    "allow": [
      "Bash(npm run:*)",
      "Bash(npx:*)",
      "Bash(grep:*)",
      "Bash(find:*)",
      "Bash(ls:*)",
      "Bash(cat:*)",
      "Bash(curl -s:*)",
      "Bash(node:*)"
    ]
  }
}
```

This gives Claude Code the access it needs without you clicking "allow" 50 times per session. Remove the hardcoded API keys from permission strings — those should only live in .env files.

---

## PART 3: APPLIANCE TRACKER — AGENT-READINESS AUDIT

This is the critical section. Your goal is to make the appliance tracking system so precise that an agent can run it. Here's what's missing.

### Current State Machine (What Exists)

```
INTAKE:
  Shop worker → logs item → condition assessed → at_shop, pending approval

APPROVAL:
  Manager → approve/reject/edit

IF NOT WORKING:
  Manager approves → sent_to_jurf → Jurf receives → at_jurf
  Jurf repairs → condition: repaired
  Delivery → delivered to destination shop

IF WORKING:
  Stays at_shop → goes to marketplace?? (UNDEFINED)

IF SCRAP:
  Manager marks scrap → pending_scrap → then what?? (UNDEFINED)
```

### Critical Gaps for Agent-Readiness

**Gap 1: No defined end states.** What happens AFTER an appliance is "delivered"? Does it go on the marketplace? Does it stay in the appliance tracker? When is an appliance considered "done"? An agent can't complete a workflow if there's no defined completion.

**Gap 2: The "Working" path is empty.** If a shop worker logs an item as "Working," the manager approves it, and then... nothing. It sits in the system as "at_shop, working, approved." There's no transition to the marketplace (shop_items table) or any next step. An agent needs to know: working items go WHERE?

**Gap 3: Scrap has no resolution.** Items can be marked as scrap or pending_scrap, but there's no disposal flow. Who authorizes final disposal? Is there a pickup? An agent can't mark something as truly "done" without this.

**Gap 4: No validation on state transitions.** Right now, the API accepts any update to any field. Nothing prevents someone from changing an item's location_status from "at_shop" directly to "delivered" without going through sent_to_jurf → at_jurf first. The API is just a raw CRUD layer — there's no business logic enforcing valid transitions. An agent would need to enforce these rules, or the system would need to enforce them FOR the agent.

**Gap 5: No notification system.** The current flow requires humans to check dashboards. An agent-driven system needs push: "Item X arrived at Jurf" → Jurf team gets notified. "Item Y repaired" → Manager gets notified. Without this, the agent has no way to prompt the next human action.

**Gap 6: Photo-to-completion gap.** Your vision is "employee uploads 1-2 photos, system handles the rest." Currently, the photo goes to Gemini for barcode reading only. The system doesn't use the photo to auto-determine product_type, brand, condition, or problems. Gemini COULD do this (it already does it for marketplace uploads via the team portal), but the appliance intake flow doesn't use it for auto-fill.

**Gap 7: Duplicate handling.** What if a worker scans a barcode that already exists? Currently nothing prevents duplicate entries. An agent needs a clear rule: reject duplicate? Update existing? Flag for review?

**Gap 8: No Gemini auto-fill in appliance intake.** Your team portal (/team) uses Gemini to auto-fill item_name, brand, category, condition from photos. But the appliance intake (/appliances/shop/in) only uses Gemini for barcode scanning. The worker still manually selects product type, brand, status, and problems. This is the #1 friction point for your agent vision — the worker should upload photos and the system should fill everything.

### What the Agent-Ready State Machine Should Look Like

```
┌─────────────────────────────────────────────────────┐
│                    INTAKE                             │
│  Worker uploads 1-2 photos + selects shop             │
│  System auto-fills: product, brand, condition, issues │
│  → Status: PENDING_REVIEW                             │
└─────────────────┬───────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────┐
│                  AUTO-TRIAGE (AGENT)                   │
│  Agent reviews Gemini analysis + photo                 │
│  Determines: WORKING / NEEDS_REPAIR / SCRAP            │
│  → Routes automatically based on condition              │
└──────┬──────────────┬─────────────────┬─────────────┘
       │              │                 │
       ▼              ▼                 ▼
   WORKING      NEEDS_REPAIR          SCRAP
   at_shop      → sent_to_jurf       → pending_disposal
       │              │                 │
       ▼              ▼                 ▼
  TO_MARKETPLACE  at_jurf         MANAGER_REVIEW
  (auto-list?)    → repaired        → disposed
                  → delivered          (end state)
                  → at_shop
                  → TO_MARKETPLACE
                     (end state)
```

### The 5-Step Agent-Ready Roadmap

**Step 1: Add Gemini auto-fill to appliance intake** (HIGH IMPACT, LOW EFFORT)
Copy the Gemini analysis logic from /team upload flow into /appliances/shop/in. When a worker takes a photo, Gemini should return: product_type, brand, estimated condition, and visible problems. Worker confirms or corrects. This alone cuts intake time by 70%.

**Step 2: Enforce state transitions in the API** (HIGH IMPACT, MEDIUM EFFORT)
Add a `validateTransition(currentState, newState)` function to the appliance API. Define the legal transitions:
- at_shop → sent_to_jurf (requires: condition = not_working, approval = approved)
- sent_to_jurf → at_jurf (requires: jurf team confirms receipt)
- at_jurf → repaired/scrap (requires: jurf assessment)
- repaired → delivered (requires: destination_shop set)
- delivered → (end state, optionally → marketplace)

**Step 3: Define end states and marketplace bridge** (MEDIUM IMPACT, MEDIUM EFFORT)
When an appliance is "delivered" and condition is "working" or "repaired," create a bridge to the shop_items table. This can be agent-triggered: "This Samsung refrigerator was repaired, tested working, delivered to Shop B. Create marketplace listing?" 

**Step 4: Add notification hooks** (HIGH IMPACT, MEDIUM EFFORT)
Use Supabase webhooks or a simple polling system. Key notifications:
- Item logged → Manager gets alert
- Item approved → Shop worker gets confirmation
- Sent to Jurf → Jurf team gets alert
- Overdue (>24h in transit) → Manager gets escalation
- Repaired → Manager + delivery team get alert

**Step 5: Build the agent layer** (THE GOAL)
With steps 1-4 done, the agent becomes straightforward:
- Receives photo + minimal context
- Calls Gemini for analysis
- Validates against business rules
- Routes to correct workflow
- Updates states
- Sends notifications
- Flags exceptions for human review (low confidence, unusual items, high-value items)

---

## PART 4: IMMEDIATE ACTION ITEMS

### Done (Today)

- [x] Created CLAUDE.md with full project context — every Claude Code session now starts informed
- [x] Documented the complete state machine and identified gaps

### This Week

- [ ] Clean up .claude/settings.local.json (use the broader permission patterns above)
- [ ] Add Gemini auto-fill to appliance intake flow (steal from /team portal logic)
- [ ] Add duplicate barcode detection (check before insert, show existing item if found)
- [ ] Add transition validation to /api/appliances (reject invalid state changes)

### Next 2 Weeks

- [ ] Break up manager/page.tsx (600+ lines) into components: PendingList, ApprovedList, FilterBar, ItemCard, EditModal
- [ ] Break up admin/page.tsx (1200+ lines) similarly
- [ ] Add basic tests for state transition validation
- [ ] Define and implement end states (what happens after delivery?)
- [ ] Build the marketplace bridge (appliance → shop_item)

### Before Building the Agent

- [ ] All state transitions enforced at API level
- [ ] Gemini auto-fill working reliably on appliance intake
- [ ] Notification system in place
- [ ] End states defined and tested
- [ ] Edge cases documented (duplicates, conflicts, rollbacks)
- [ ] At least basic test coverage on business logic
- [ ] Audit log captures every state change with metadata

---

## PART 5: CLAUDE TOOL DECISION MATRIX

| Task | Use This | NOT This |
|------|----------|----------|
| Design a new feature/system | Claude Chat | Claude Code |
| Build/implement code | Claude Code | Chat (copy-paste) |
| Debug a bug | Claude Code (reads files directly) | Chat (screenshots) |
| Create documents/reports | Cowork | Chat |
| Database schema changes | Claude Code (write SQL, explain) | Chat |
| UI iteration | Claude Code (edit, build, preview) | Chat |
| Business strategy | Claude Chat | — |
| Agent design/planning | Claude Chat → then Code for implementation | — |
| Quick question | Either (but don't switch mid-task) | — |

The key rule: **never switch tools mid-task.** If you started in Code, finish in Code. The context loss from switching costs more than the benefit of the other tool.

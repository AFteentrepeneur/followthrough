# Follow-Through Agent

Built for the AWS **Agents for Humans Hackathon** (Professional Agents track).

## The problem this solves

Every meeting tool today (Otter, Fireflies, Fellow, Zoom AI Companion...) has solved
transcription and action-item *extraction*. None of them solve *follow-through*.
Action items get identified, formatted nicely, and then sit there — someone still has
to manually create the ticket, send the reminder, and remember three weeks later that
it never got done. And every one of these tools treats each meeting as an isolated
event: nothing compounds across meetings, so a dropped commitment just quietly dies.

**This isn't a minor annoyance — it's measured at scale:**
- Asana's Anatomy of Work Index (10,000+ knowledge workers surveyed) found **60% of
  the average workday goes to "work about work"** — chasing status, re-explaining
  priorities, tracking down what happened to something — leaving just ~25–27% for
  actual skilled work. UK workers alone lose **157 hours/year to unnecessary meetings**
  and 227 hours to duplicated/stale work.
- Gallup's *State of the Global Workplace 2026* put global daily workplace stress at a
  record **40–44%**, with engagement at its lowest since 2020.
- And critically: **89% of leaders report generative AI has had no measurable labor
  productivity impact** (NBER, cited in the same Gallup report), and a separate MIT
  study found **95% of companies saw zero measurable profit impact from GenAI**. Most
  "AI agents" bolt a chatbot onto a workflow without changing what actually happens.
  Follow-Through is built to be judged against that bar: it doesn't just describe the
  next step, it takes it — and only asks a human for a decision when one is genuinely
  needed.

**Follow-Through is an agent that closes the loop instead of just documenting it.**

Give it a transcript. It:
1. Extracts real commitments (owner + concrete task), ignoring vague chatter
2. Checks its own memory (the ledger) for whether this is a **new** commitment or one
   **resurfacing** from a past meeting, unresolved
3. **Actually sends** the follow-up reminder — not a draft for you to review and send yourself
4. Tracks how many times a commitment has resurfaced, and marks it stale after the 2nd time
5. **Escalates to you only when something is genuinely stuck** — that's the one moment a
   human needs to make a decision. Everything else runs quietly in the background.

That last point is the whole point of the hackathon's brief: an agent that "runs
autonomously and only surfaces when there's a real decision to make."

## Architecture

- **Next.js 16** (App Router) — single app, UI + API routes
- **`@strands-agents/sdk`** (TypeScript) — the agent loop and tool orchestration
- **6 custom tools** given to one Strands `Agent`:
  - `lookup_open_commitments` — checks the ledger for a person's existing open items
  - `record_commitment` — logs a brand-new commitment
  - `mark_commitment_resurfaced` — increments resurface count, marks stale at 2+
  - `send_followup_email` — actually sends (or simulates, if unconfigured) the reminder
  - `escalate_commitment` — the *only* tool that should surface to a human
  - `close_commitment` — closes the loop when something's actually done
- **JSON-file ledger** (`data/ledger.json`, gitignored) — the persistent, cross-meeting
  memory that's the whole differentiator. Swap this for Postgres/DynamoDB/Bedrock
  Knowledge Base for a production deployment; the interface in `lib/store.ts` is small.
- **Email**: sends via [Resend](https://resend.com) if `RESEND_API_KEY` is set,
  otherwise logs the "sent" email to the console — so the whole flow is demoable
  without setting up an email provider first.

The agent decides *for itself*, via tool calls, whether something is new vs.
resurfacing vs. stuck — this isn't a fixed if/else pipeline, it's a genuine
model-driven agent loop as Strands intends.

## Running it

```bash
npm install
cp .env.example .env.local
# edit .env.local and add ONE of: ANTHROPIC_API_KEY, OPENAI_API_KEY
# (or leave both blank + set AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY to use
#  the SDK's default Amazon Bedrock provider)
npm run dev
```

Open http://localhost:3000. Two sample meetings are built into the "Process a
meeting" tab — load "Meeting 1" first (Marcus commits to send a pricing sheet by
Friday), then load "Meeting 2" (Marcus hasn't done it) to see the agent recognize
the resurfacing commitment, mark it stale, and escalate — that's the demo moment.

## What's stubbed for the hackathon timeline

- **Transcript input is paste/upload**, not a live meeting-bot recorder (Zoom/Meet
  integration is its own multi-day project — the agent's *behavior* is the point
  being judged, not transcription).
- **Ledger is a JSON file**, not a database — trivial to swap, kept simple to move fast.
- **Email sending** works for real with a Resend key; otherwise it's logged, not sent.

## Sources

- Asana, *Anatomy of Work Index* — asana.com/resources/anatomy-of-work-hub
- Gallup, *State of the Global Workplace 2026* — gallup.com/workplace/349484
- NBER labor-productivity survey and MIT GenAI profit-impact study, both cited in
  Gallup's 2026 report

## What would come next

- Real ticket creation (Linear/Jira) as a 7th tool
- Deploy to Amazon Bedrock AgentCore for durable, autonomous scheduling (e.g. running
  on a cron against a calendar feed instead of a manual paste)
- Swap the JSON ledger for Bedrock Knowledge Base / a real DB for multi-user use

import { Agent, tool } from "@strands-agents/sdk";
import { AnthropicModel } from "@strands-agents/sdk/models/anthropic";
import { OpenAIModel } from "@strands-agents/sdk/models/openai";
import { GoogleModel } from "@strands-agents/sdk/models/google";
import { z } from "zod";
import { nanoid } from "nanoid";
import {
  getOpenCommitmentsForAttendees,
  getAllCommitments,
  upsertCommitment,
} from "./store";
import { sendFollowupEmail } from "./email";
import type { Commitment } from "./types";

// --- Tool: check what this person already owes, before logging something new ---
const lookupOpenCommitments = tool({
  name: "lookup_open_commitments",
  description:
    "Look up existing open, stale, or escalated commitments for a given person, so you can tell whether something discussed in this meeting is actually NEW or is a commitment resurfacing from a prior meeting. ALWAYS call this before record_commitment for each person mentioned.",
  inputSchema: z.object({
    owner: z.string().describe("Name of the person to look up commitments for"),
  }),
  callback: (input: { owner: string }) => {
    const commitments = getOpenCommitmentsForAttendees([input.owner]);
    if (commitments.length === 0) {
      return `No open commitments found for ${input.owner}.`;
    }
    return JSON.stringify(
      commitments.map((c) => ({
        id: c.id,
        task: c.task,
        deadline: c.deadline,
        status: c.status,
        timesSeen: c.timesSeen,
        createdAt: c.createdAt,
      }))
    );
  },
});

// --- Tool: log a brand new commitment ---
const recordCommitment = tool({
  name: "record_commitment",
  description:
    "Create a NEW commitment in the ledger for a concrete task someone agreed to do (has an owner and is actionable — not vague chatter). Only call this for tasks that do NOT already exist in the ledger (check lookup_open_commitments first for each owner).",
  inputSchema: z.object({
    owner: z.string().describe("Person who owns the task"),
    task: z.string().describe("Concrete description of what they agreed to do"),
    deadline: z
      .string()
      .nullable()
      .optional()
      .describe("ISO date (YYYY-MM-DD) if a deadline was mentioned, otherwise null"),
    meetingId: z.string(),
    meetingTitle: z.string(),
  }),
  callback: (input: {
    owner: string;
    task: string;
    deadline?: string | null;
    meetingId: string;
    meetingTitle: string;
  }) => {
    const now = new Date().toISOString();
    const commitment: Commitment = {
      id: nanoid(8),
      meetingId: input.meetingId,
      meetingTitle: input.meetingTitle,
      owner: input.owner,
      task: input.task,
      deadline: input.deadline ?? null,
      confidence: 0.8,
      status: "open",
      createdAt: now,
      updatedAt: now,
      timesSeen: 1,
      actionLog: [
        {
          timestamp: now,
          type: "created",
          detail: `Extracted from meeting "${input.meetingTitle}"`,
        },
      ],
    };
    upsertCommitment(commitment);
    return `Recorded commitment ${commitment.id} for ${input.owner}: "${input.task}"`;
  },
});

// --- Tool: a known open commitment came up again, unresolved ---
const markResurfaced = tool({
  name: "mark_commitment_resurfaced",
  description:
    "Call this when a commitment found via lookup_open_commitments came up again in the CURRENT meeting and is still unresolved. This increments its resurface count and marks it stale after the 2nd time, which is what should trigger escalation consideration.",
  inputSchema: z.object({
    commitmentId: z.string(),
    noteFromThisMeeting: z
      .string()
      .describe("Brief note on what was said about it this time"),
  }),
  callback: (input: { commitmentId: string; noteFromThisMeeting: string }) => {
    const all = getAllCommitments();
    const c = all.find((x) => x.id === input.commitmentId);
    if (!c) return `No commitment found with id ${input.commitmentId}`;
    c.timesSeen += 1;
    c.updatedAt = new Date().toISOString();
    if (c.timesSeen >= 2 && c.status === "open") {
      c.status = "stale";
    }
    c.actionLog.push({
      timestamp: c.updatedAt,
      type: "note",
      detail: input.noteFromThisMeeting,
    });
    upsertCommitment(c);
    return `Commitment ${c.id} now resurfaced ${c.timesSeen} time(s), status=${c.status}`;
  },
});

// --- Tool: actually send the reminder, don't just draft it ---
const sendFollowup = tool({
  name: "send_followup_email",
  description:
    "Actually send a follow-up email to a commitment owner reminding them what they agreed to do. This executes the send — it is not a draft for a human to review first.",
  inputSchema: z.object({
    commitmentId: z.string(),
    to: z.string().describe("Email address of the recipient"),
    subject: z.string(),
    body: z.string(),
  }),
  callback: async (input: {
    commitmentId: string;
    to: string;
    subject: string;
    body: string;
  }) => {
    const result = await sendFollowupEmail(input.to, input.subject, input.body);
    const all = getAllCommitments();
    const c = all.find((x) => x.id === input.commitmentId);
    if (c) {
      c.actionLog.push({
        timestamp: new Date().toISOString(),
        type: "reminder_sent",
        detail: `${input.subject} -> ${input.to}`,
      });
      upsertCommitment(c);
    }
    return result;
  },
});

// --- Tool: the ONLY point where a human should be pulled in ---
const escalateCommitment = tool({
  name: "escalate_commitment",
  description:
    "Escalate a commitment that has gone stale or been ignored repeatedly (timesSeen >= 2, or a follow-up email got no result). This is the only action that should surface to the human user for a decision — use it sparingly, only for genuinely stuck items, not routine reminders.",
  inputSchema: z.object({
    commitmentId: z.string(),
    reason: z.string().describe("Why this needs a human decision now"),
  }),
  callback: (input: { commitmentId: string; reason: string }) => {
    const all = getAllCommitments();
    const c = all.find((x) => x.id === input.commitmentId);
    if (!c) return `No commitment found with id ${input.commitmentId}`;
    c.status = "escalated";
    c.updatedAt = new Date().toISOString();
    c.actionLog.push({
      timestamp: c.updatedAt,
      type: "escalated",
      detail: input.reason,
    });
    upsertCommitment(c);
    return `Escalated commitment ${c.id}: ${input.reason}`;
  },
});

// --- Tool: close the loop when something is actually done ---
const closeCommitment = tool({
  name: "close_commitment",
  description:
    "Mark a commitment as closed/done. Call this when the transcript indicates a previously open commitment was completed.",
  inputSchema: z.object({ commitmentId: z.string() }),
  callback: (input: { commitmentId: string }) => {
    const all = getAllCommitments();
    const c = all.find((x) => x.id === input.commitmentId);
    if (!c) return `No commitment found with id ${input.commitmentId}`;
    c.status = "closed";
    c.updatedAt = new Date().toISOString();
    c.actionLog.push({
      timestamp: c.updatedAt,
      type: "closed",
      detail: "Marked done based on meeting transcript",
    });
    upsertCommitment(c);
    return `Closed commitment ${c.id}`;
  },
});

const SYSTEM_PROMPT = `You are the Follow-Through Agent, an autonomous assistant that turns meeting transcripts into tracked, executed commitments — and remembers them across meetings so nothing quietly dies.

For every transcript you process:
1. Read it and identify concrete commitments: an owner + a specific actionable task. Ignore vague chatter ("I should really clean my desk") — look for clear signals like "I'll send...", "I'll have it by...", "let's schedule...".
2. For EACH person who owns a commitment, call lookup_open_commitments first to see if they already have something open from a prior meeting.
   - If the current discussion is about a commitment that ALREADY EXISTS in the ledger and is still unresolved, call mark_commitment_resurfaced instead of creating a duplicate.
   - If the transcript indicates an existing commitment is now done, call close_commitment.
   - If it's genuinely new, call record_commitment.
3. For every commitment that is brand new or was reasonably reminder-worthy this cycle, call send_followup_email to actually send a reminder — do not just describe what the email would say.
4. Only call escalate_commitment for items that are stale (resurfaced 2+ times) or otherwise clearly stuck — this is the ONLY time a human should need to make a decision. Do not escalate routine, on-track items.
5. When you finish, write a short plain-English narrative (3-6 sentences) summarizing what you found, what you recorded, what you sent, and what (if anything) you escalated and why. This narrative is shown directly to the user, so make it concrete and specific — reference actual names and tasks, not generic language.`;

function createModel() {
  if (process.env.ANTHROPIC_API_KEY) {
    return new AnthropicModel({
      apiKey: process.env.ANTHROPIC_API_KEY,
      modelId: "claude-sonnet-4-6",
    });
  }
  if (process.env.OPENAI_API_KEY) {
    return new OpenAIModel({
      apiKey: process.env.OPENAI_API_KEY,
      modelId: "gpt-4.1",
    });
  }
  if (process.env.GOOGLE_API_KEY) {
    return new GoogleModel({
      apiKey: process.env.GOOGLE_API_KEY,
      modelId: "gemini-2.0-flash-lite",
    });
  }
  // Falls back to the SDK default (Amazon Bedrock) if no key is set.
  return undefined;
}

export function buildFollowThroughAgent() {
  const model = createModel();
  return new Agent({
    ...(model ? { model } : {}),
    systemPrompt: SYSTEM_PROMPT,
    tools: [
      lookupOpenCommitments,
      recordCommitment,
      markResurfaced,
      sendFollowup,
      escalateCommitment,
      closeCommitment,
    ],
  });
}

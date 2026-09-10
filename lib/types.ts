export type CommitmentStatus = "open" | "closed" | "stale" | "escalated";

export interface Commitment {
  id: string;
  meetingId: string;
  meetingTitle: string;
  owner: string;
  task: string;
  deadline: string | null; // ISO date string or null if not specified
  confidence: number; // 0-1, how confident the extractor is this is a real commitment
  status: CommitmentStatus;
  createdAt: string; // ISO timestamp of when it was first extracted
  updatedAt: string; // ISO timestamp of last status change
  timesSeen: number; // how many meetings this same commitment has resurfaced in
  actionLog: ActionLogEntry[];
}

export interface ActionLogEntry {
  timestamp: string;
  type: "created" | "reminder_sent" | "escalated" | "closed" | "note";
  detail: string;
}

export interface Meeting {
  id: string;
  title: string;
  attendees: string[];
  transcript: string;
  processedAt: string;
}

export interface ProcessResult {
  meeting: Meeting;
  newCommitments: Commitment[];
  matchedExisting: Commitment[]; // commitments from prior meetings that resurfaced
  escalated: Commitment[]; // commitments the agent decided to escalate this run
  agentNarrative: string; // the agent's own summary of what it did and why
}

import fs from "node:fs";
import path from "node:path";
import { Commitment, Meeting } from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const LEDGER_PATH = path.join(DATA_DIR, "ledger.json");
const MEETINGS_PATH = path.join(DATA_DIR, "meetings.json");

interface LedgerFile {
  commitments: Commitment[];
}

interface MeetingsFile {
  meetings: Meeting[];
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function readJson<T>(filePath: string, fallback: T): T {
  ensureDataDir();
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(fallback, null, 2));
    return fallback;
  }
  const raw = fs.readFileSync(filePath, "utf-8");
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson<T>(filePath: string, data: T) {
  ensureDataDir();
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

// --- Commitments ledger ---

export function getAllCommitments(): Commitment[] {
  return readJson<LedgerFile>(LEDGER_PATH, { commitments: [] }).commitments;
}

export function saveAllCommitments(commitments: Commitment[]) {
  writeJson<LedgerFile>(LEDGER_PATH, { commitments });
}

export function getOpenCommitmentsForAttendees(attendees: string[]): Commitment[] {
  const all = getAllCommitments();
  const lowerAttendees = attendees.map((a) => a.toLowerCase());
  return all.filter(
    (c) =>
      (c.status === "open" || c.status === "stale" || c.status === "escalated") &&
      lowerAttendees.includes(c.owner.toLowerCase())
  );
}

export function upsertCommitment(commitment: Commitment) {
  const all = getAllCommitments();
  const idx = all.findIndex((c) => c.id === commitment.id);
  if (idx >= 0) {
    all[idx] = commitment;
  } else {
    all.push(commitment);
  }
  saveAllCommitments(all);
}

// --- Meetings history ---

export function getAllMeetings(): Meeting[] {
  return readJson<MeetingsFile>(MEETINGS_PATH, { meetings: [] }).meetings;
}

export function saveMeeting(meeting: Meeting) {
  const all = getAllMeetings();
  all.push(meeting);
  writeJson<MeetingsFile>(MEETINGS_PATH, { meetings: all });
}

// --- Digest helpers ---

export function computeDigest() {
  const all = getAllCommitments();
  const open = all.filter((c) => c.status === "open");
  const stale = all.filter((c) => c.status === "stale");
  const escalated = all.filter((c) => c.status === "escalated");
  const closed = all.filter((c) => c.status === "closed");
  return { open, stale, escalated, closed, total: all.length };
}

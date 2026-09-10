"use client";

import { useEffect, useState } from "react";
import type { Commitment, ProcessResult } from "@/lib/types";

const SAMPLE_MEETING_1 = {
  title: "Q3 Client Renewal Sync",
  attendees: "Priya, Marcus, Dana",
  transcript: `Dana: Okay, on the Meridian renewal — Marcus, can you get the updated pricing sheet over to their procurement team?
Marcus: Yep, I'll send that over by Friday.
Priya: And I'll follow up with legal on the redlines, should have something back early next week.
Dana: Great, let's regroup then.`,
};

const SAMPLE_MEETING_2 = {
  title: "Q3 Client Renewal Sync — Week 2",
  attendees: "Priya, Marcus, Dana",
  transcript: `Dana: Quick check-in on Meridian. Marcus, did the pricing sheet go out?
Marcus: Ah — not yet, sorry, it's been a hectic week, I'll try to get to it.
Priya: Legal redlines are back, I closed that one out yesterday.
Dana: Okay, let's keep moving.`,
};

type Tab = "new" | "ledger";

export default function Home() {
  const [tab, setTab] = useState<Tab>("new");
  const [title, setTitle] = useState("");
  const [attendees, setAttendees] = useState("");
  const [transcript, setTranscript] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ProcessResult | null>(null);
  const [digest, setDigest] = useState<{
    open: Commitment[];
    stale: Commitment[];
    escalated: Commitment[];
    closed: Commitment[];
    total: number;
  } | null>(null);

  async function loadDigest() {
    const res = await fetch("/api/digest");
    if (res.ok) setDigest(await res.json());
  }

  useEffect(() => {
    loadDigest();
  }, []);

  function loadSample(sample: typeof SAMPLE_MEETING_1) {
    setTitle(sample.title);
    setAttendees(sample.attendees);
    setTranscript(sample.transcript);
    setResult(null);
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/process-transcript", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, attendees, transcript }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong.");
      } else {
        setResult(data);
        await loadDigest();
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={styles.page}>
      <header style={styles.header}>
        <div>
          <h1 style={styles.h1}>Follow-Through</h1>
          <p style={styles.tagline}>
            Not a note-taker. An agent that remembers what you agreed to — across every meeting — and closes the loop itself.
          </p>
        </div>
        <nav style={styles.tabs}>
          <button
            onClick={() => setTab("new")}
            style={tab === "new" ? styles.tabActive : styles.tab}
          >
            Process a meeting
          </button>
          <button
            onClick={() => setTab("ledger")}
            style={tab === "ledger" ? styles.tabActive : styles.tab}
          >
            Ledger{digest ? ` (${digest.total})` : ""}
          </button>
        </nav>
      </header>

      {tab === "new" && (
        <section>
          <div style={styles.sampleRow}>
            <span style={styles.sampleLabel}>Try it:</span>
            <button style={styles.linkBtn} onClick={() => loadSample(SAMPLE_MEETING_1)}>
              Load "Meeting 1" (Marcus commits to Friday)
            </button>
            <button style={styles.linkBtn} onClick={() => loadSample(SAMPLE_MEETING_2)}>
              Load "Meeting 2" (Marcus hasn't done it yet)
            </button>
          </div>

          <form onSubmit={handleSubmit} style={styles.form}>
            <label style={styles.label}>
              Meeting title
              <input
                style={styles.input}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Q3 Client Renewal Sync"
              />
            </label>
            <label style={styles.label}>
              Attendees (comma-separated)
              <input
                style={styles.input}
                value={attendees}
                onChange={(e) => setAttendees(e.target.value)}
                placeholder="e.g. Priya, Marcus, Dana"
              />
            </label>
            <label style={styles.label}>
              Transcript
              <textarea
                style={styles.textarea}
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                rows={10}
                placeholder="Paste the meeting transcript here…"
              />
            </label>
            <button type="submit" disabled={loading} style={styles.submitBtn}>
              {loading ? "Processing…" : "Run the agent"}
            </button>
          </form>

          {error && <p style={styles.error}>{error}</p>}

          {result && (
            <div style={styles.resultBox}>
              <h2 style={styles.h2}>What the agent did</h2>
              <p style={styles.narrative}>{result.agentNarrative}</p>

              {result.newCommitments.length > 0 && (
                <>
                  <h3 style={styles.h3}>New commitments recorded</h3>
                  {result.newCommitments.map((c) => (
                    <CommitmentRow key={c.id} c={c} />
                  ))}
                </>
              )}

              {result.matchedExisting.length > 0 && (
                <>
                  <h3 style={styles.h3}>Resurfaced from a prior meeting</h3>
                  {result.matchedExisting.map((c) => (
                    <CommitmentRow key={c.id} c={c} />
                  ))}
                </>
              )}

              {result.escalated.length > 0 && (
                <>
                  <h3 style={{ ...styles.h3, color: "var(--accent-amber)" }}>
                    Escalated — needs your decision
                  </h3>
                  {result.escalated.map((c) => (
                    <CommitmentRow key={c.id} c={c} />
                  ))}
                </>
              )}
            </div>
          )}
        </section>
      )}

      {tab === "ledger" && digest && (
        <section>
          <LedgerGroup title="Escalated — needs a decision" items={digest.escalated} emptyText="Nothing escalated. Quiet is good." accent="var(--accent-amber)" />
          <LedgerGroup title="Stale (resurfaced 2+ times)" items={digest.stale} emptyText="No stale commitments." accent="var(--accent-amber)" />
          <LedgerGroup title="Open" items={digest.open} emptyText="No open commitments." />
          <LedgerGroup title="Closed" items={digest.closed} emptyText="Nothing closed yet." accent="var(--accent-green)" />
        </section>
      )}
    </main>
  );
}

function LedgerGroup({
  title,
  items,
  emptyText,
  accent,
}: {
  title: string;
  items: Commitment[];
  emptyText: string;
  accent?: string;
}) {
  return (
    <div style={{ marginBottom: 32 }}>
      <h3 style={{ ...styles.h3, color: accent || "var(--text)" }}>
        {title} ({items.length})
      </h3>
      {items.length === 0 ? (
        <p style={styles.emptyText}>{emptyText}</p>
      ) : (
        items.map((c) => <CommitmentRow key={c.id} c={c} />)
      )}
    </div>
  );
}

function CommitmentRow({ c }: { c: Commitment }) {
  return (
    <div style={styles.row}>
      <div style={styles.rowMain}>
        <span style={styles.rowOwner}>{c.owner}</span>
        <span style={styles.rowTask}>{c.task}</span>
      </div>
      <div style={styles.rowMeta}>
        <span>{c.meetingTitle}</span>
        {c.deadline && <span> · due {c.deadline}</span>}
        {c.timesSeen > 1 && <span> · seen {c.timesSeen}×</span>}
        <span style={styles.rowId}> · #{c.id}</span>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    maxWidth: 720,
    margin: "0 auto",
    padding: "56px 24px 96px",
  },
  header: {
    display: "flex",
    flexDirection: "column",
    gap: 20,
    marginBottom: 40,
    borderBottom: "1px solid var(--border)",
    paddingBottom: 28,
  },
  h1: {
    fontFamily: "var(--serif)",
    fontSize: 40,
    fontWeight: 600,
    margin: 0,
    letterSpacing: "-0.01em",
  },
  tagline: {
    color: "var(--text-muted)",
    fontSize: 15,
    marginTop: 10,
    maxWidth: 520,
    lineHeight: 1.5,
  },
  tabs: {
    display: "flex",
    gap: 4,
  },
  tab: {
    background: "transparent",
    border: "1px solid var(--border)",
    color: "var(--text-muted)",
    padding: "8px 14px",
    borderRadius: 6,
    cursor: "pointer",
    fontSize: 14,
  },
  tabActive: {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    color: "var(--text)",
    padding: "8px 14px",
    borderRadius: 6,
    cursor: "pointer",
    fontSize: 14,
  },
  sampleRow: {
    display: "flex",
    gap: 12,
    alignItems: "baseline",
    flexWrap: "wrap",
    marginBottom: 20,
    fontSize: 13,
  },
  sampleLabel: { color: "var(--text-muted)" },
  linkBtn: {
    background: "none",
    border: "none",
    color: "var(--accent-blue)",
    cursor: "pointer",
    fontSize: 13,
    padding: 0,
    textDecoration: "underline",
    textUnderlineOffset: 3,
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
  },
  label: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    fontSize: 13,
    color: "var(--text-muted)",
  },
  input: {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 6,
    padding: "10px 12px",
    color: "var(--text)",
    fontSize: 14,
  },
  textarea: {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 6,
    padding: "10px 12px",
    color: "var(--text)",
    fontSize: 14,
    fontFamily: "var(--mono)",
    lineHeight: 1.6,
    resize: "vertical",
  },
  submitBtn: {
    background: "var(--text)",
    color: "var(--bg)",
    border: "none",
    borderRadius: 6,
    padding: "12px 20px",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    alignSelf: "flex-start",
  },
  error: {
    color: "#c26b5f",
    marginTop: 16,
    fontSize: 14,
  },
  resultBox: {
    marginTop: 36,
    paddingTop: 28,
    borderTop: "1px solid var(--border)",
  },
  h2: {
    fontFamily: "var(--serif)",
    fontSize: 22,
    margin: "0 0 12px",
  },
  h3: {
    fontSize: 13,
    textTransform: "none",
    color: "var(--text-muted)",
    margin: "24px 0 10px",
    fontWeight: 600,
  },
  narrative: {
    fontSize: 15,
    lineHeight: 1.6,
    color: "var(--text)",
  },
  emptyText: {
    color: "var(--text-muted)",
    fontSize: 13,
  },
  row: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    padding: "12px 0",
    borderBottom: "1px solid var(--border)",
  },
  rowMain: {
    display: "flex",
    gap: 10,
    fontSize: 14,
  },
  rowOwner: {
    fontWeight: 600,
    minWidth: 80,
  },
  rowTask: {
    color: "var(--text)",
  },
  rowMeta: {
    fontFamily: "var(--mono)",
    fontSize: 11,
    color: "var(--text-muted)",
  },
  rowId: {
    color: "var(--text-muted)",
  },
};

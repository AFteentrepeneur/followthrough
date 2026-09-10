import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { buildFollowThroughAgent } from "@/lib/agent";
import { getAllCommitments, saveMeeting } from "@/lib/store";
import type { ProcessResult } from "@/lib/types";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { title, attendees, transcript } = body as {
      title: string;
      attendees: string; // comma-separated
      transcript: string;
    };

    if (!transcript || !transcript.trim()) {
      return NextResponse.json({ error: "Transcript is required." }, { status: 400 });
    }

    const meetingId = nanoid(8);
    const meetingTitle = title?.trim() || `Meeting ${meetingId}`;
    const attendeeList = (attendees || "")
      .split(",")
      .map((a) => a.trim())
      .filter(Boolean);

    saveMeeting({
      id: meetingId,
      title: meetingTitle,
      attendees: attendeeList,
      transcript,
      processedAt: new Date().toISOString(),
    });

    const before = getAllCommitments();
    const beforeIds = new Set(before.map((c) => c.id));
    const beforeStatus = new Map(before.map((c) => [c.id, c.status]));

    const agent = buildFollowThroughAgent();
    const prompt = `Meeting: "${meetingTitle}" (id: ${meetingId})
Attendees: ${attendeeList.join(", ") || "unknown"}

Transcript:
"""
${transcript}
"""

Process this transcript now following your instructions.`;

    const result = await agent.invoke(prompt);
    const narrative = result.lastMessage.content
      .filter((block: any) => block.type === "textBlock")
      .map((block: any) => block.text)
      .join("\n")
      .trim();

    const after = getAllCommitments();
    const newCommitments = after.filter((c) => !beforeIds.has(c.id));
    const matchedExisting = after.filter(
      (c) => beforeIds.has(c.id) && beforeStatus.get(c.id) !== c.status
    );
    const escalated = after.filter(
      (c) => c.status === "escalated" && beforeStatus.get(c.id) !== "escalated"
    );

    const payload: ProcessResult = {
      meeting: {
        id: meetingId,
        title: meetingTitle,
        attendees: attendeeList,
        transcript,
        processedAt: new Date().toISOString(),
      },
      newCommitments,
      matchedExisting,
      escalated,
      agentNarrative: narrative || "The agent finished but returned no narrative text.",
    };

    return NextResponse.json(payload);
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: (err as Error).message || "Failed to process transcript." },
      { status: 500 }
    );
  }
}

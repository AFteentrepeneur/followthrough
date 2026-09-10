// Sends a follow-up email. If RESEND_API_KEY is configured, sends for real
// via Resend's HTTP API. Otherwise logs the "sent" email so the agent's
// behavior is still fully demoable without any email provider set up.

export async function sendFollowupEmail(
  to: string,
  subject: string,
  body: string
): Promise<string> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.FOLLOWUP_FROM_EMAIL || "agent@example.com";

  if (!apiKey) {
    console.log(`[followthrough-agent] (simulated email) To: ${to} | Subject: ${subject}\n${body}`);
    return `Simulated send (no RESEND_API_KEY set) to ${to}: "${subject}"`;
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        text: body,
      }),
    });
    if (!res.ok) {
      const errText = await res.text();
      return `Email send failed (${res.status}): ${errText}`;
    }
    return `Email sent to ${to}: "${subject}"`;
  } catch (err) {
    return `Email send error: ${(err as Error).message}`;
  }
}

import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Follow-Through Agent",
  description: "An agent that closes the loop on meeting commitments, not just extracts them.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

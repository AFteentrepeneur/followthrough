import { NextResponse } from "next/server";
import { computeDigest } from "@/lib/store";

export async function GET() {
  const digest = computeDigest();
  return NextResponse.json(digest);
}
